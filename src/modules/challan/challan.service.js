"use strict";

const { Op, QueryTypes } = require("sequelize");
const { getTenantModels } = require("../tenant/tenantModels.js");
const stockService = require("../stock/stock.service.js");
const inventoryLedgerService = require("../inventoryLedger/inventoryLedger.service.js");
const {
    TRANSACTION_TYPE,
    MOVEMENT_TYPE,
    SERIAL_STATUS,
} = require("../../common/utils/constants.js");
const { getBomLineProduct } = require("../../common/utils/bomUtils.js");

const VALID_STRING_OPS = ["contains", "notContains", "equals", "notEquals", "startsWith", "endsWith"];
const VALID_DATE_OPS = ["inRange", "equals", "before", "after"];

const buildStringCondition = (field, value, op = "contains") => {
    const val = String(value || "").trim();
    if (!val) return null;
    const safeOp = VALID_STRING_OPS.includes(op) ? op : "contains";
    let pattern;
    switch (safeOp) {
        case "contains":
            pattern = `%${val}%`;
            return { [field]: { [Op.iLike]: pattern } };
        case "notContains":
            pattern = `%${val}%`;
            return { [field]: { [Op.notILike]: pattern } };
        case "equals":
            return { [field]: { [Op.iLike]: val } };
        case "notEquals":
            return { [field]: { [Op.notILike]: val } };
        case "startsWith":
            pattern = `${val}%`;
            return { [field]: { [Op.iLike]: pattern } };
        case "endsWith":
            pattern = `%${val}`;
            return { [field]: { [Op.iLike]: pattern } };
        default:
            return { [field]: { [Op.iLike]: `%${val}%` } };
    }
};

/**
 * Generate challan number: CH-MMYY####
 */
const generateChallanNumber = async () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear()).slice(-2);
    const mmyy = `${month}${year}`;

    // Find the highest sequence number for current month
    const models = getTenantModels();
    const results = await models.sequelize.query(
        `SELECT challan_no 
         FROM challans 
         WHERE challan_no LIKE :pattern 
           AND deleted_at IS NULL
         ORDER BY challan_no DESC
         LIMIT 1`,
        {
            replacements: {
                pattern: `CH-${mmyy}%`,
            },
            type: QueryTypes.SELECT,
        }
    );

    let sequenceNumber = 1;
    if (results && results.length > 0 && results[0].challan_no) {
        // Extract the sequence number from the last challan number
        const lastChallanNo = results[0].challan_no;
        const lastSequence = parseInt(lastChallanNo.slice(-4));
        sequenceNumber = lastSequence + 1;
    }

    const formattedSequence = String(sequenceNumber).padStart(4, "0");
    return `CH-${mmyy}${formattedSequence}`;
};

/**
 * Recompute and persist order.bom_snapshot shipped_qty / pending_qty from challan items.
 * Call after createChallan, updateChallan, deleteChallan for the affected order.
 */
const updateOrderBomShippedQuantities = async (orderId, transaction = null) => {
    if (!orderId) return;
    const models = getTenantModels();
    const { Order, Challan, ChallanItems } = models;
    const order = await Order.findOne({
        where: { id: orderId, deleted_at: null },
        attributes: ["id", "bom_snapshot"],
        transaction,
    });
    if (!order || !Array.isArray(order.bom_snapshot) || order.bom_snapshot.length === 0) return;

    const challans = await Challan.findAll({
        where: { order_id: orderId, deleted_at: null },
        include: [
            { model: ChallanItems, as: "items", attributes: ["product_id", "quantity"] },
        ],
        transaction,
    });

    const shippedByProduct = {};
    challans.forEach((c) => {
        (c.items || []).forEach((item) => {
            const pid = item.product_id;
            const qty = Number(item.quantity) || 0;
            shippedByProduct[pid] = (shippedByProduct[pid] || 0) + qty;
        });
    });

    const qtyNum = (n) => (n != null && !Number.isNaN(Number(n)) ? Number(n) : 0);
    const updatedSnapshot = order.bom_snapshot.map((line) => {
        const baseQty =
            line.planned_qty != null && !Number.isNaN(Number(line.planned_qty))
                ? qtyNum(line.planned_qty)
                : qtyNum(line.quantity);
        const shipped_qty = shippedByProduct[line.product_id] || 0;
        const returned_qty = qtyNum(line.returned_qty);
        const pending_qty = baseQty - shipped_qty + returned_qty;
        return {
            ...line,
            shipped_qty,
            returned_qty,
            pending_qty,
            planned_qty: baseQty,
            delivered_qty: shipped_qty,
        };
    });

    await order.update({ bom_snapshot: updatedSnapshot }, { transaction });
};

/**
 * Recompute and persist order.delivery_status ('pending' | 'partial' | 'complete')
 * based on BOM shipped and pending quantities.
 */
const recomputeOrderDeliveryStatus = async (orderId, transaction = null) => {
    if (!orderId) return;
    const models = getTenantModels();
    const { Order } = models;
    const order = await Order.findOne({
        where: { id: orderId, deleted_at: null },
        attributes: ["id", "bom_snapshot", "delivery_status"],
        transaction,
    });
    if (!order || !Array.isArray(order.bom_snapshot) || order.bom_snapshot.length === 0) return;

    const bom = order.bom_snapshot;

    let anyShipped = false;
    let anyPending = false;
    let totalRequired = 0;

    bom.forEach((line) => {
        const qtyNum = (n) => (n != null && !Number.isNaN(Number(n)) ? Number(n) : 0);
        const baseQty = qtyNum(line.quantity);
        const required = line.planned_qty != null && !Number.isNaN(Number(line.planned_qty))
            ? qtyNum(line.planned_qty)
            : baseQty;
        const shipped = qtyNum(line.shipped_qty);
        const pending = line.pending_qty != null && !Number.isNaN(Number(line.pending_qty))
            ? Number(line.pending_qty)
            : Math.max(0, required - shipped + qtyNum(line.returned_qty));

        totalRequired += required;
        if (shipped > 0) anyShipped = true;
        if (pending > 0) anyPending = true;
    });

    let deliveryStatus = order.delivery_status || "pending";
    if (!anyShipped || totalRequired === 0) {
        deliveryStatus = "pending";
    } else if (anyPending) {
        deliveryStatus = "partial";
    } else {
        deliveryStatus = "complete";
    }

    await order.update({ delivery_status: deliveryStatus }, { transaction });
};

/**
 * List challans with pagination and filtering
 */
const listChallans = async ({
    order_id,
    page = 1,
    limit = 20,
    search = null,
    scope = "all",
    user_id = null,
    sortBy = "id",
    sortOrder = "DESC",
    challan_no: challanNo = null,
    challan_no_op: challanNoOp = null,
    challan_date_from: challanDateFrom = null,
    challan_date_to: challanDateTo = null,
    challan_date_op: challanDateOp = null,
    order_number: orderNumber = null,
    warehouse_name: warehouseName = null,
    transporter = null,
    created_at_from: createdAtFrom = null,
    created_at_to: createdAtTo = null,
    created_at_op: createdAtOp = null,
    enforced_handled_by_ids: enforcedHandledByIds = null,
} = {}) => {
    const models = getTenantModels();
    const { Challan, ChallanItems, Order, CompanyWarehouse, User } = models;
    const offset = (page - 1) * limit;
    const where = { deleted_at: null };

    if (order_id) {
        where.order_id = order_id;
    }

    if (search) {
        where[Op.or] = [
            { challan_no: { [Op.iLike]: `%${search}%` } },
            { transporter: { [Op.iLike]: `%${search}%` } },
        ];
    }

    // Exact challan_no filter with operators
    if (challanNo) {
        where[Op.and] = where[Op.and] || [];
        const cond = buildStringCondition("challan_no", challanNo, challanNoOp || "contains");
        if (cond) where[Op.and].push(cond);
    }

    // challan_date filters
    const challanDateOpSafe = VALID_DATE_OPS.includes(challanDateOp) ? challanDateOp : "inRange";
    if (challanDateFrom || challanDateTo) {
        where[Op.and] = where[Op.and] || [];
        const dateCond = {};
        if (["equals", "before", "after"].includes(challanDateOpSafe)) {
            if (challanDateFrom) {
                const d = new Date(challanDateFrom);
                if (challanDateOpSafe === "equals") dateCond[Op.eq] = d;
                else if (challanDateOpSafe === "before") dateCond[Op.lt] = d;
                else if (challanDateOpSafe === "after") dateCond[Op.gt] = d;
            }
        } else {
            if (challanDateFrom) dateCond[Op.gte] = new Date(challanDateFrom);
            if (challanDateTo) dateCond[Op.lte] = new Date(challanDateTo);
        }
        if (Reflect.ownKeys(dateCond).length) {
            where[Op.and].push({ challan_date: dateCond });
        }
    }

    // Transporter filter (simple contains)
    if (transporter) {
        where[Op.and] = where[Op.and] || [];
        const cond = buildStringCondition("transporter", transporter, "contains");
        if (cond) where[Op.and].push(cond);
    }

    // Created_at filters
    const createdAtOpSafe = VALID_DATE_OPS.includes(createdAtOp) ? createdAtOp : "inRange";
    if (createdAtFrom || createdAtTo) {
        where[Op.and] = where[Op.and] || [];
        const createdCond = {};
        if (["equals", "before", "after"].includes(createdAtOpSafe)) {
            if (createdAtFrom) {
                const d = new Date(createdAtFrom);
                if (createdAtOpSafe === "equals") createdCond[Op.eq] = d;
                else if (createdAtOpSafe === "before") createdCond[Op.lt] = d;
                else if (createdAtOpSafe === "after") createdCond[Op.gt] = d;
            }
        } else {
            if (createdAtFrom) createdCond[Op.gte] = new Date(createdAtFrom);
            if (createdAtTo) createdCond[Op.lte] = new Date(createdAtTo);
        }
        if (Reflect.ownKeys(createdCond).length) {
            where[Op.and].push({ created_at: createdCond });
        }
    }

    // Scope=my or my_warehouse: restrict to warehouses managed by the current user
    if ((scope === "my" || scope === "my_warehouse") && user_id) {
        const managedWarehouses = await CompanyWarehouse.findAll({
            include: [
                {
                    model: User,
                    as: "managers",
                    attributes: [],
                    required: true,
                    where: { id: user_id },
                },
            ],
            attributes: ["id"],
        });

        const warehouseIds = managedWarehouses.map((w) => w.id);
        if (warehouseIds.length === 0) {
            return {
                data: [],
                meta: {
                    total: 0,
                    page,
                    limit,
                    pages: 0,
                },
            };
        }

        where.warehouse_id = { [Op.in]: warehouseIds };
    }

    // Related model filters
    const orderWhereAnd = [];
    if (orderNumber) {
        const orderNumberCond = buildStringCondition("order_number", orderNumber, "contains");
        if (orderNumberCond) orderWhereAnd.push(orderNumberCond);
    }
    const orderWhere = orderWhereAnd.length > 0 ? { [Op.and]: orderWhereAnd } : null;

    if (Array.isArray(enforcedHandledByIds)) {
        where[Op.and] = where[Op.and] || [];
        if (enforcedHandledByIds.length === 0) {
            where[Op.and].push({
                [Op.or]: [
                    { created_by: { [Op.in]: [-1] } },
                    { "$order.handled_by$": { [Op.in]: [-1] } },
                ],
            });
        } else {
            where[Op.and].push({
                [Op.or]: [
                    { created_by: { [Op.in]: enforcedHandledByIds } },
                    { "$order.handled_by$": { [Op.in]: enforcedHandledByIds } },
                ],
            });
        }
    }
    const warehouseWhere = warehouseName
        ? buildStringCondition("name", warehouseName, "contains")
        : null;

    const sortField = ["challan_no", "challan_date", "created_at", "id"].includes(sortBy)
        ? sortBy
        : "id";
    const sortDir = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { count, rows } = await Challan.findAndCountAll({
        where,
        limit,
        offset,
        order: [[sortField, sortDir]],
        subQuery: false,
        include: [
            {
                model: Order,
                as: "order",
                attributes: ["id", "order_number", "handled_by"],
                required: !!orderWhere,
                ...(orderWhere && { where: orderWhere }),
            },
            {
                model: CompanyWarehouse,
                as: "warehouse",
                attributes: ["id", "name"],
                required: !!warehouseWhere,
                ...(warehouseWhere && { where: warehouseWhere }),
            },
            {
                model: ChallanItems,
                as: "items",
                attributes: ["id"],
            },
        ],
        distinct: true,
    });

    const data = (rows || []).map((c) => {
        const row = c.toJSON();
        return {
            id: row.id,
            challan_no: row.challan_no,
            challan_date: row.challan_date,
            transporter: row.transporter,
            order: row.order ? { id: row.order.id, order_number: row.order.order_number } : null,
            warehouse: row.warehouse ? { id: row.warehouse.id, name: row.warehouse.name } : null,
            items: row.items || [],
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    });

    return {
        data,
        meta: {
            page,
            limit,
            total: count,
            pages: limit > 0 ? Math.ceil(count / limit) : 0,
        },
    };
};

/**
 * Get challan by ID with all related data
 */
const getChallanById = async ({ id } = {}) => {
    const models = getTenantModels();
    const { Challan, ChallanItems, Order, CompanyWarehouse, Product, ProductType, MeasurementUnit } = models;
    const challan = await Challan.findOne({
        where: { id, deleted_at: null },
        include: [
            {
                model: Order,
                as: "order",
                attributes: ["id", "order_number", "consumer_no", "capacity", "handled_by"],
            },
            {
                model: CompanyWarehouse,
                as: "warehouse",
                attributes: ["id", "name"],
            },
            {
                model: ChallanItems,
                as: "items",
                include: [
                    {
                        model: Product,
                        as: "product",
                        include: [
                            {
                                model: ProductType,
                                as: "productType",
                                attributes: ["id", "name"],
                            },
                            {
                                model: MeasurementUnit,
                                as: "measurementUnit",
                                attributes: ["id", "unit"],
                            },
                        ],
                    },
                ],
            },
        ],
    });

    return challan;
};

/**
 * Get challan by ID with complete printable payload.
 */
const getChallanForPdf = async ({ id } = {}) => {
    const models = getTenantModels();
    const { Challan, ChallanItems, Order, CompanyWarehouse, Product, ProductType, MeasurementUnit, Customer, Quotation, User } = models;
    const challan = await Challan.findOne({
        where: { id, deleted_at: null },
        include: [
            {
                model: Order,
                as: "order",
                attributes: ["id", "order_number", "consumer_no", "capacity", "handled_by"],
                include: [
                    {
                        model: Customer,
                        as: "customer",
                        attributes: [
                            "id",
                            "customer_name",
                            "mobile_number",
                            "phone_no",
                            "address",
                            "landmark_area",
                            "taluka",
                            "district",
                        ],
                    },
                    {
                        model: User,
                        as: "handledBy",
                        attributes: ["id", "name"],
                    },
                ],
            },
            {
                model: CompanyWarehouse,
                as: "warehouse",
                attributes: ["id", "name", "contact_person", "mobile", "phone_no", "email", "address"],
            },
            {
                model: ChallanItems,
                as: "items",
                include: [
                    {
                        model: Product,
                        as: "product",
                        attributes: ["id", "product_name", "product_description", "hsn_ssn_code"],
                        include: [
                            {
                                model: MeasurementUnit,
                                as: "measurementUnit",
                                attributes: ["id", "unit"],
                            },
                        ],
                    },
                ],
            },
        ],
        order: [[{ model: ChallanItems, as: "items" }, "id", "ASC"]],
    });

    return challan;
};

/**
 * Create challan with items
 */
const createChallan = async ({ payload, user_id, transaction } = {}) => {
    const models = getTenantModels();
    const { Challan, ChallanItems, Order, CompanyWarehouse, Product, Stock, StockSerial, Quotation, User, ProductType } = models;
    const { items, ...challanData } = payload;

    // Validate minimum one item
    if (!items || items.length === 0) {
        const error = new Error("At least one item is required");
        error.statusCode = 400;
        throw error;
    }

    // Validate quantities against order BOM or (fallback) quotation legacy
    // Also enforce warehouse manager authorization and planned warehouse constraint.
    let order = null;
    let plannedWarehouseId = null;
    let isFirstChallan = false;
    if (challanData.order_id) {
        order = await Order.findOne({
            where: { id: challanData.order_id, deleted_at: null },
            attributes: ["id", "bom_snapshot", "stages", "current_stage_key", "planned_warehouse_id", "status"],
            include: [
                {
                    model: Quotation,
                    as: "quotation",
                    attributes: [
                        "id",
                        "panel_quantity",
                        "inverter_quantity",
                        "hybrid_inverter_quantity",
                        "battery_quantity",
                        "acdb_quantity",
                        "dcdb_quantity",
                        "cable_ac_quantity",
                        "cable_dc_quantity",
                        "earthing_quantity",
                        "la_quantity",
                    ],
                },
            ],
            transaction,
        });

        if (!order) {
            const error = new Error("Order not found");
            error.statusCode = 404;
            throw error;
        }

        // Order must be confirmed to create delivery challan
        if (String(order.status || "").toLowerCase() !== "confirmed") {
            const error = new Error("Order must be confirmed to create delivery challan");
            error.statusCode = 400;
            throw error;
        }

        plannedWarehouseId = order.planned_warehouse_id;
        if (!plannedWarehouseId) {
            const error = new Error("Planned warehouse is not set for this order");
            error.statusCode = 400;
            throw error;
        }

        // Enforce that the current user is a manager of the planned warehouse
        if (!user_id) {
            const error = new Error("User context is required to create challan");
            error.statusCode = 403;
            throw error;
        }

        const warehouseWithManager = await CompanyWarehouse.findOne({
            where: { id: plannedWarehouseId, deleted_at: null },
            include: [
                {
                    model: User,
                    as: "managers",
                    attributes: ["id"],
                    where: { id: user_id },
                    required: true,
                },
            ],
            transaction,
        });

        if (!warehouseWithManager) {
            const error = new Error("You are not a manager of the planned warehouse for this order");
            error.statusCode = 403;
            throw error;
        }

        // Force challan warehouse to be the planned warehouse
        if (challanData.warehouse_id && Number(challanData.warehouse_id) !== Number(plannedWarehouseId)) {
            const error = new Error("Challan warehouse must match the order's planned warehouse");
            error.statusCode = 400;
            throw error;
        }
        challanData.warehouse_id = plannedWarehouseId;

        const previousChallans = await Challan.findAll({
            where: { order_id: challanData.order_id, deleted_at: null },
            include: [
                { model: ChallanItems, as: "items", attributes: ["product_id", "quantity"] },
            ],
            transaction,
        });

        const previousQuantities = {};
        previousChallans.forEach((c) => {
            (c.items || []).forEach((it) => {
                const pid = it.product_id;
                previousQuantities[pid] = (previousQuantities[pid] || 0) + parseFloat(it.quantity);
            });
        });

        const useBomSnapshot = Array.isArray(order.bom_snapshot) && order.bom_snapshot.length > 0;

        // Track whether this is the first challan for this order (for stage transition)
        isFirstChallan = previousChallans.length === 0;

        if (useBomSnapshot) {
            const bomByProductId = {};
            const qtyNum = (n) => (n != null && !Number.isNaN(Number(n)) ? Number(n) : 0);
            order.bom_snapshot.forEach((line) => {
                const quantity = qtyNum(line.quantity);
                const planned = line.planned_qty != null && !Number.isNaN(Number(line.planned_qty))
                    ? qtyNum(line.planned_qty)
                    : quantity;
                bomByProductId[line.product_id] = { maxQty: planned, line };
            });
            // Build productIdToName for user-friendly error messages (items not in BOM)
            const itemProductIds = [...new Set(items.map((i) => i.product_id))];
            const itemProducts = await Product.findAll({
                where: { id: itemProductIds, deleted_at: null },
                attributes: ["id", "product_name"],
                transaction,
            });
            const productIdToName = {};
            itemProducts.forEach((p) => { productIdToName[p.id] = p.product_name || `Product #${p.id}`; });

            for (const item of items) {
                const bomEntry = bomByProductId[item.product_id];
                const productName = productIdToName[item.product_id] || `Product #${item.product_id}`;
                if (!bomEntry) {
                    const error = new Error(`${productName} is not in order BOM`);
                    error.statusCode = 400;
                    throw error;
                }
                const previousQty = previousQuantities[item.product_id] || 0;
                const currentQty = parseFloat(item.quantity) || 0;
                const totalQty = previousQty + currentQty;
                const maxQty = bomEntry.maxQty;
                if (totalQty > maxQty) {
                    const lineProductName = getBomLineProduct(bomEntry.line)?.product_name || productName;
                    const error = new Error(
                        `Total quantity for ${lineProductName} (${totalQty}) exceeds planned quantity (${maxQty}). Previous challan: ${previousQty}, Current: ${currentQty}`
                    );
                    error.statusCode = 400;
                    throw error;
                }
            }
        } else if (order.quotation) {
            const validatableTypes = [
                "panel", "inverter", "hybrid_inverter", "battery", "acdb", "dcdb",
                "ac_cable", "dc_cable", "earthing", "la",
            ];
            const typeToQuotationField = {
                panel: "panel_quantity", inverter: "inverter_quantity",
                hybrid_inverter: "hybrid_inverter_quantity", battery: "battery_quantity",
                acdb: "acdb_quantity", dcdb: "dcdb_quantity",
                ac_cable: "cable_ac_quantity", dc_cable: "cable_dc_quantity",
                earthing: "earthing_quantity", la: "la_quantity",
            };
            const productIds = items.map((item) => item.product_id);
            const products = await Product.findAll({
                where: { id: productIds, deleted_at: null },
                include: [{ model: ProductType, as: "productType", attributes: ["id", "name"] }],
                transaction,
            });
            const productMap = {};
            products.forEach((p) => { productMap[p.id] = p; });

            for (const item of items) {
                const product = productMap[item.product_id];
                if (!product || !product.productType) continue;
                const productTypeName = product.productType.name.toLowerCase().replace(/\s+/g, "_");
                if (!validatableTypes.includes(productTypeName)) continue;
                const quotationField = typeToQuotationField[productTypeName];
                const quotationQty = order.quotation[quotationField];
                if (quotationQty == null) continue;
                const previousQty = previousQuantities[item.product_id] || 0;
                const currentQty = parseFloat(item.quantity);
                const totalQty = previousQty + currentQty;
                if (totalQty > parseFloat(quotationQty)) {
                    const error = new Error(
                        `Total quantity for ${product.product_name} (${totalQty}) exceeds quotation quantity (${quotationQty}). Previous challan quantity: ${previousQty}, Current: ${currentQty}`
                    );
                    error.statusCode = 400;
                    throw error;
                }
            }
        }
    }

    // Generate challan number if not provided
    if (!challanData.challan_no) {
        challanData.challan_no = await generateChallanNumber();
    }

    // Create challan
    const challan = await Challan.create(challanData, { transaction });

    // Create challan items
    const itemsToCreate = items.map(item => ({
        ...item,
        challan_id: challan.id,
    }));

    await ChallanItems.bulkCreate(itemsToCreate, { transaction });

    // Inventory operations (OUT) for each item
    if (challanData.order_id && plannedWarehouseId && Array.isArray(items) && items.length > 0) {
        const productIds = [...new Set(items.map((i) => i.product_id))];
        const products = await Product.findAll({
            where: { id: productIds, deleted_at: null },
            transaction,
        });
        const productMap = {};
        products.forEach((p) => { productMap[p.id] = p; });

        const orderForRef = await Order.findByPk(challanData.order_id, {
            transaction,
            attributes: ["order_number"],
        });
        const transactionReferenceNo = orderForRef?.order_number ?? null;

        for (const item of items) {
            const qty = Number(item.quantity);
            const product = productMap[item.product_id];
            const productName = product?.product_name || `Product #${item.product_id}`;

            if (!Number.isFinite(qty) || qty <= 0) {
                const error = new Error(`Invalid quantity for ${productName}`);
                error.statusCode = 400;
                throw error;
            }
            // Stocks are integer-based; enforce whole quantities
            if (!Number.isInteger(qty)) {
                const error = new Error(`Quantity for ${productName} must be a whole number`);
                error.statusCode = 400;
                throw error;
            }

            if (!product) {
                const error = new Error(`Product not found: ${productName}`);
                error.statusCode = 404;
                throw error;
            }

            const stock = await stockService.getOrCreateStock({
                product_id: item.product_id,
                warehouse_id: plannedWarehouseId,
                product,
                transaction,
            });

            if (stock.quantity_available < qty) {
                const error = new Error(
                    `Insufficient stock for ${productName}. Available: ${stock.quantity_available}, Required: ${qty}`
                );
                error.statusCode = 400;
                throw error;
            }

            const isSerialized = !!stock.serial_required || !!product.serial_required;
            const serialsRaw = item.serials || "";
            const serialList = serialsRaw
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0);

            if (isSerialized) {
                if (serialList.length !== qty) {
                    const error = new Error(
                        `Serial count (${serialList.length}) must match quantity (${qty}) for ${productName}`
                    );
                    error.statusCode = 400;
                    throw error;
                }

                for (const serial of serialList) {
                    const stockSerial = await StockSerial.findOne({
                        where: {
                            serial_number: serial,
                            product_id: item.product_id,
                            warehouse_id: plannedWarehouseId,
                        },
                        lock: transaction.LOCK.UPDATE,
                        transaction,
                    });

                    if (!stockSerial) {
                        const error = new Error(
                            `Serial '${serial}' is not available at this warehouse for ${productName}`
                        );
                        error.statusCode = 400;
                        throw error;
                    }

                    if (stockSerial.status !== SERIAL_STATUS.AVAILABLE) {
                        const error = new Error(
                            `Serial '${serial}' for ${productName} is not available`
                        );
                        error.statusCode = 400;
                        throw error;
                    }

                    await stockSerial.update(
                        {
                            status: SERIAL_STATUS.ISSUED,
                            outward_date: new Date(),
                            source_type: TRANSACTION_TYPE.DELIVERY_CHALLAN_OUT,
                            source_id: challan.id,
                            issued_against: "customer_order",
                            reference_number: transactionReferenceNo,
                        },
                        { transaction }
                    );

                    await inventoryLedgerService.createLedgerEntry({
                        product_id: item.product_id,
                        warehouse_id: plannedWarehouseId,
                        stock_id: stock.id,
                        transaction_type: TRANSACTION_TYPE.DELIVERY_CHALLAN_OUT,
                        transaction_id: challan.id,
                        transaction_reference_no: transactionReferenceNo,
                        movement_type: MOVEMENT_TYPE.OUT,
                        quantity: 1,
                        serial_id: stockSerial.id,
                        rate: null,
                        gst_percent: null,
                        amount: null,
                        reason: `Delivery challan ${challan.challan_no}`,
                        performed_by: user_id,
                        transaction,
                    });
                }
            } else {
                await inventoryLedgerService.createLedgerEntry({
                    product_id: item.product_id,
                    warehouse_id: plannedWarehouseId,
                    stock_id: stock.id,
                    transaction_type: TRANSACTION_TYPE.DELIVERY_CHALLAN_OUT,
                    transaction_id: challan.id,
                    transaction_reference_no: transactionReferenceNo,
                    movement_type: MOVEMENT_TYPE.OUT,
                    quantity: qty,
                    rate: null,
                    gst_percent: null,
                    amount: null,
                    reason: `Delivery challan ${challan.challan_no}`,
                    performed_by: user_id,
                    transaction,
                });
            }

            await stockService.updateStockQuantities({
                stock,
                quantity: qty,
                last_updated_by: user_id,
                isInward: false,
                transaction,
            });
        }
    }

    // Update order BOM shipped quantities and recompute delivery status.
    if (challanData.order_id) {
        await updateOrderBomShippedQuantities(challanData.order_id, transaction);

        const freshOrder = await Order.findOne({
            where: { id: challanData.order_id, deleted_at: null },
            attributes: ["id", "bom_snapshot", "stages", "current_stage_key", "delivery_status"],
            transaction,
        });

        // On first challan only, move order to next stage (Delivery -> Fabrication)
        if (
            isFirstChallan &&
            freshOrder &&
            freshOrder.current_stage_key === "delivery" &&
            freshOrder.stages &&
            freshOrder.stages.delivery === "pending"
        ) {
            const updatedStages = {
                ...freshOrder.stages,
                delivery: "completed",
                assign_fabricator_and_installer:
                    freshOrder.stages.assign_fabricator_and_installer === "locked" ||
                    typeof freshOrder.stages.assign_fabricator_and_installer === "undefined"
                        ? "pending"
                        : freshOrder.stages.assign_fabricator_and_installer,
            };

            await freshOrder.update(
                {
                    stages: updatedStages,
                    current_stage_key: "assign_fabricator_and_installer",
                },
                { transaction }
            );
        }

        // Always recompute delivery_status from BOM snapshot
        await recomputeOrderDeliveryStatus(challanData.order_id, transaction);
    }

    // Fetch created challan with items
    return await getChallanById({ id: challan.id });
};

/**
 * Update challan
 */
const updateChallan = async ({ id, payload, transaction } = {}) => {
    const models = getTenantModels();
    const { Challan, ChallanItems, Order, CompanyWarehouse, Product, Stock, StockSerial } = models;
    const { items, ...challanData } = payload;

    const challan = await Challan.findOne({
        where: { id, deleted_at: null },
    });

    if (!challan) {
        throw new Error("Challan not found");
    }

    // Update challan
    await challan.update(challanData, { transaction });

    // If items are provided, update them
    if (items) {
        // Delete existing items
        await ChallanItems.destroy({
            where: { challan_id: id },
            transaction,
        });

        // Create new items
        const itemsToCreate = items.map(item => ({
            ...item,
            challan_id: id,
        }));

        await ChallanItems.bulkCreate(itemsToCreate, { transaction });
    }

    if (challan.order_id) {
        await updateOrderBomShippedQuantities(challan.order_id, transaction);
    }

    // Fetch updated challan with items
    return await getChallanById({ id });
};

/**
 * Delete challan (soft delete)
 */
const deleteChallan = async ({ id, user_id, transaction } = {}) => {
    const models = getTenantModels();
    const { Challan, ChallanItems, Order, Product, StockSerial } = models;
    const challan = await Challan.findOne({
        where: { id, deleted_at: null },
        include: [
            {
                model: ChallanItems,
                as: "items",
            },
        ],
        transaction,
    });

    if (!challan) {
        throw new Error("Challan not found");
    }

    const orderId = challan.order_id;
    const warehouseId = challan.warehouse_id;

    // Reverse inventory: bring stock back in and, for known serials, mark them AVAILABLE again.
    if (warehouseId && Array.isArray(challan.items) && challan.items.length > 0) {
        const productIds = [...new Set(challan.items.map((i) => i.product_id))];
        const products = await Product.findAll({
            where: { id: productIds, deleted_at: null },
            transaction,
        });
        const productMap = {};
        products.forEach((p) => { productMap[p.id] = p; });

        const orderForRef = await Order.findByPk(challan.order_id, {
            transaction,
            attributes: ["order_number"],
        });
        const transactionReferenceNo = orderForRef?.order_number ?? null;

        for (const item of challan.items) {
            const qty = Number(item.quantity);
            if (!Number.isFinite(qty) || qty <= 0) {
                continue;
            }

            const product = productMap[item.product_id];
            if (!product) continue;

            const stock = await stockService.getOrCreateStock({
                product_id: item.product_id,
                warehouse_id: warehouseId,
                product,
                transaction,
            });

            const isSerialized = !!stock.serial_required || !!product.serial_required;
            const serialsRaw = item.serials || "";
            const serialList = serialsRaw
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0);

            if (isSerialized && serialList.length > 0) {
                for (const serial of serialList) {
                    const stockSerial = await StockSerial.findOne({
                        where: {
                            serial_number: serial,
                            product_id: item.product_id,
                        },
                        transaction,
                    });

                    if (stockSerial) {
                        await stockSerial.update(
                            {
                                status: SERIAL_STATUS.AVAILABLE,
                                warehouse_id: warehouseId,
                                stock_id: stock.id,
                                // keep outward_date as history
                                source_type: stockSerial.source_type || TRANSACTION_TYPE.DELIVERY_CHALLAN_CANCEL_IN,
                                issued_against: null,
                                reference_number: null,
                            },
                            { transaction }
                        );

                        await inventoryLedgerService.createLedgerEntry({
                            product_id: item.product_id,
                            warehouse_id: warehouseId,
                            stock_id: stock.id,
                            transaction_type: TRANSACTION_TYPE.DELIVERY_CHALLAN_CANCEL_IN,
                            transaction_id: challan.id,
                            transaction_reference_no: transactionReferenceNo,
                            movement_type: MOVEMENT_TYPE.IN,
                            quantity: 1,
                            serial_id: stockSerial.id,
                            rate: null,
                            gst_percent: null,
                            amount: null,
                            reason: `Reversal for delivery challan ${challan.challan_no}`,
                            performed_by: user_id,
                            transaction,
                        });
                    } else {
                        // Serial not found in inventory; just reverse quantity at stock level.
                        await inventoryLedgerService.createLedgerEntry({
                            product_id: item.product_id,
                            warehouse_id: warehouseId,
                            stock_id: stock.id,
                            transaction_type: TRANSACTION_TYPE.DELIVERY_CHALLAN_CANCEL_IN,
                            transaction_id: challan.id,
                            transaction_reference_no: transactionReferenceNo,
                            movement_type: MOVEMENT_TYPE.IN,
                            quantity: 1,
                            serial_id: null,
                            rate: null,
                            gst_percent: null,
                            amount: null,
                            reason: `Reversal for delivery challan ${challan.challan_no}`,
                            performed_by: user_id,
                            transaction,
                        });
                    }
                }
            } else {
                await inventoryLedgerService.createLedgerEntry({
                    product_id: item.product_id,
                    warehouse_id: warehouseId,
                    stock_id: stock.id,
                    transaction_type: TRANSACTION_TYPE.DELIVERY_CHALLAN_CANCEL_IN,
                    transaction_id: challan.id,
                    transaction_reference_no: transactionReferenceNo,
                    movement_type: MOVEMENT_TYPE.IN,
                    quantity: qty,
                    serial_id: null,
                    rate: null,
                    gst_percent: null,
                    amount: null,
                    reason: `Reversal for delivery challan ${challan.challan_no}`,
                    performed_by: user_id,
                    transaction,
                });
            }

            await stockService.updateStockQuantities({
                stock,
                quantity: qty,
                last_updated_by: user_id,
                isInward: true,
                transaction,
            });
        }
    }

    await challan.destroy({ transaction });

    if (orderId) {
        await updateOrderBomShippedQuantities(orderId, transaction);
        await recomputeOrderDeliveryStatus(orderId, transaction);
    }

    return { message: "Challan deleted successfully" };
};

/**
 * Get next challan number
 */
const getNextChallanNumber = async () => {
    return await generateChallanNumber();
};

/**
 * Get quotation products by order_id
 * Product list from order.bom_snapshot or quotation.bom_snapshot when present, else legacy quotation product IDs.
 */
const getQuotationProductsByOrderId = async ({ order_id } = {}) => {
    const models = getTenantModels();
    const { Order, Quotation, Product, ProductType } = models;
    const order = await Order.findOne({
        where: { id: order_id, deleted_at: null },
        attributes: ["id", "bom_snapshot"],
        include: [
            {
                model: Quotation,
                as: "quotation",
                attributes: [
                    "id",
                    "bom_snapshot",
                    "structure_product",
                    "panel_product",
                    "inverter_product",
                    "battery_product",
                    "hybrid_inverter_product",
                    "acdb_product",
                    "dcdb_product",
                    "cable_ac_product",
                    "cable_dc_product",
                    "earthing_product",
                    "la_product",
                ],
            },
        ],
    });

    if (!order) {
        throw new Error("Order not found");
    }

    let productIds = [];
    const bom = Array.isArray(order.bom_snapshot) && order.bom_snapshot.length > 0
        ? order.bom_snapshot
        : (order.quotation && Array.isArray(order.quotation.bom_snapshot) && order.quotation.bom_snapshot.length > 0
            ? order.quotation.bom_snapshot
            : null);
    if (bom) {
        productIds = [...new Set(bom.map((line) => line.product_id).filter((id) => id != null))];
    } else if (order.quotation) {
        productIds = [
            order.quotation.structure_product,
            order.quotation.panel_product,
            order.quotation.inverter_product,
            order.quotation.battery_product,
            order.quotation.hybrid_inverter_product,
            order.quotation.acdb_product,
            order.quotation.dcdb_product,
            order.quotation.cable_ac_product,
            order.quotation.cable_dc_product,
            order.quotation.earthing_product,
            order.quotation.la_product,
        ].filter((id) => id != null && id !== undefined);
    }

    if (productIds.length === 0) {
        return { products: [] };
    }

    const products = await Product.findAll({
        where: { id: productIds, deleted_at: null },
        include: [
            { model: ProductType, as: "productType", attributes: ["id", "name"] },
        ],
    });

    return { products };
};

/**
 * Get delivery status for an order.
 * When order.bom_snapshot is present: status keyed by product_id (required, delivered, pending, status).
 * Else: status keyed by product type (panel, inverter, ...) from quotation legacy.
 */
const getDeliveryStatus = async ({ order_id } = {}) => {
    const models = getTenantModels();
    const { Order, Quotation, Challan, ChallanItems, Product, ProductType } = models;
    const order = await Order.findOne({
        where: { id: order_id, deleted_at: null },
        attributes: ["id", "bom_snapshot"],
        include: [
            {
                model: Quotation,
                as: "quotation",
                attributes: [
                    "id",
                    "structure_product", "panel_product", "inverter_product", "battery_product",
                    "hybrid_inverter_product", "acdb_product", "dcdb_product",
                    "cable_ac_product", "cable_dc_product", "earthing_product", "la_product",
                    "panel_quantity", "inverter_quantity", "hybrid_inverter_quantity", "battery_quantity",
                    "acdb_quantity", "dcdb_quantity", "cable_ac_quantity", "cable_dc_quantity",
                    "earthing_quantity", "la_quantity",
                ],
            },
        ],
    });

    if (!order) {
        throw new Error("Order not found");
    }

    const challans = await Challan.findAll({
        where: { order_id, deleted_at: null },
        include: [
            {
                model: ChallanItems,
                as: "items",
                attributes: ["product_id", "quantity"],
                include: [
                    {
                        model: Product,
                        as: "product",
                        attributes: ["id", "product_name"],
                        include: [
                            { model: ProductType, as: "productType", attributes: ["id", "name"] },
                        ],
                    },
                ],
            },
        ],
    });

    const deliveredByProductId = {};
    const deliveredByType = {};
    challans.forEach((c) => {
        (c.items || []).forEach((it) => {
            const pid = it.product_id;
            const qty = parseFloat(it.quantity);
            deliveredByProductId[pid] = (deliveredByProductId[pid] || 0) + qty;

            if (it.product && it.product.productType) {
                const typeName = it.product.productType.name.toLowerCase().replace(/\s+/g, "_");
                deliveredByType[typeName] = (deliveredByType[typeName] || 0) + qty;
            }
        });
    });

    const useBomSnapshot = Array.isArray(order.bom_snapshot) && order.bom_snapshot.length > 0;

    if (useBomSnapshot) {
        const status = {};
        const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, "_");
        order.bom_snapshot.forEach((line) => {
            const product = getBomLineProduct(line);
            const typeKey = norm(product?.product_type_name || "item");
            const baseQty = parseFloat(line.quantity) || 0;
            const required = line.planned_qty != null && !Number.isNaN(Number(line.planned_qty))
                ? Number(line.planned_qty)
                : baseQty;
            const deliveredForProduct = deliveredByProductId[line.product_id] || 0;
            const pendingForProduct = (line.pending_qty != null && !Number.isNaN(Number(line.pending_qty)))
                ? Number(line.pending_qty)
                : Math.max(0, required - deliveredForProduct);

            if (!status[typeKey]) {
                status[typeKey] = {
                    required: 0,
                    delivered: 0,
                    pending: 0,
                    status: "pending",
                };
            }

            status[typeKey].required += required;
            status[typeKey].delivered += deliveredForProduct;
            status[typeKey].pending += pendingForProduct;
        });

        Object.keys(status).forEach((key) => {
            const entry = status[key];
            if (entry.delivered >= entry.required && entry.required > 0) {
                entry.status = "complete";
            } else if (entry.delivered > 0) {
                entry.status = "partial";
            } else {
                entry.status = "pending";
            }
        });

        return { status };
    }

    if (!order.quotation) {
        return { status: {} };
    }

    const typeToQuotationField = {
        panel: "panel_quantity", inverter: "inverter_quantity", hybrid_inverter: "hybrid_inverter_quantity",
        battery: "battery_quantity", acdb: "acdb_quantity", dcdb: "dcdb_quantity",
        ac_cable: "cable_ac_quantity", dc_cable: "cable_dc_quantity",
        earthing: "earthing_quantity", la: "la_quantity",
    };
    const typeToProductField = {
        structure: "structure_product", panel: "panel_product", inverter: "inverter_product",
        battery: "battery_product", hybrid_inverter: "hybrid_inverter_product",
        acdb: "acdb_product", dcdb: "dcdb_product",
        ac_cable: "cable_ac_product", dc_cable: "cable_dc_product",
        earthing: "earthing_product", la: "la_product",
    };

    const deliveredQuantities = {};
    challans.forEach((c) => {
        (c.items || []).forEach((it) => {
            if (it.product && it.product.productType) {
                const typeName = it.product.productType.name.toLowerCase().replace(/\s+/g, "_");
                deliveredQuantities[typeName] = (deliveredQuantities[typeName] || 0) + parseFloat(it.quantity);
            }
        });
    });

    const status = {};
    Object.keys(typeToProductField).forEach((type) => {
        const productId = order.quotation[typeToProductField[type]];
        if (productId == null) return;
        const deliveredQty = deliveredQuantities[type] || 0;
        const quotationField = typeToQuotationField[type];
        const requiredQty = quotationField ? order.quotation[quotationField] : null;
        if (requiredQty != null && parseFloat(requiredQty) > 0) {
            status[type] = {
                required: parseFloat(requiredQty),
                delivered: deliveredQty,
                status: deliveredQty >= parseFloat(requiredQty) ? "complete" : deliveredQty > 0 ? "partial" : "pending",
            };
        } else {
            status[type] = {
                required: null,
                delivered: deliveredQty,
                status: deliveredQty > 0 ? "complete" : "pending",
            };
        }
    });

    return { status };
};

module.exports = {
    listChallans,
    getChallanById,
    createChallan,
    updateChallan,
    deleteChallan,
    getNextChallanNumber,
    getQuotationProductsByOrderId,
    getDeliveryStatus,
    getChallanForPdf,
};
