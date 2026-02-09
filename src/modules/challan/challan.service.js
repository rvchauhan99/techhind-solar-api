"use strict";

const db = require("../../models/index.js");
const { Op, QueryTypes } = require("sequelize");

const {
    Challan,
    ChallanItems,
    Order,
    CompanyWarehouse,
    Product,
    ProductType,
} = db;

/**
 * Generate challan number: CH-MMYY####
 */
const generateChallanNumber = async () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear()).slice(-2);
    const mmyy = `${month}${year}`;

    // Find the highest sequence number for current month
    const results = await db.sequelize.query(
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
        const quantity = qtyNum(line.quantity);
        const shipped_qty = shippedByProduct[line.product_id] || 0;
        const returned_qty = qtyNum(line.returned_qty);
        const pending_qty = quantity - shipped_qty + returned_qty;
        return {
            ...line,
            shipped_qty,
            returned_qty,
            pending_qty,
        };
    });

    await order.update({ bom_snapshot: updatedSnapshot }, { transaction });
};

/**
 * List challans with pagination and filtering
 */
const listChallans = async ({ order_id, page = 1, limit = 20, search = null } = {}) => {
    const offset = (page - 1) * limit;
    const where = { deleted_at: null };

    if (order_id) {
        where.order_id = order_id;
    }

    if (search) {
        where[Op.or] = [
            { challan_no: { [Op.like]: `%${search}%` } },
            { transporter: { [Op.like]: `%${search}%` } },
        ];
    }

    const { count, rows } = await Challan.findAndCountAll({
        where,
        limit,
        offset,
        order: [["created_at", "DESC"]],
        include: [
            {
                model: Order,
                as: "order",
                attributes: ["id", "order_number"],
            },
            {
                model: CompanyWarehouse,
                as: "warehouse",
                attributes: ["id", "name"],
            },
            {
                model: ChallanItems,
                as: "items",
                attributes: ["id"],
            },
        ],
    });

    return {
        data: rows,
        pagination: {
            total: count,
            page,
            limit,
            totalPages: Math.ceil(count / limit),
        },
    };
};

/**
 * Get challan by ID with all related data
 */
const getChallanById = async ({ id } = {}) => {
    const challan = await Challan.findOne({
        where: { id, deleted_at: null },
        include: [
            {
                model: Order,
                as: "order",
                attributes: ["id", "order_number"],
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
                        ],
                    },
                ],
            },
        ],
    });

    return challan;
};

/**
 * Create challan with items
 */
const createChallan = async ({ payload, transaction } = {}) => {
    const { items, ...challanData } = payload;

    // Validate minimum one item
    if (!items || items.length === 0) {
        const error = new Error("At least one item is required");
        error.statusCode = 400;
        throw error;
    }

    // Validate quantities against order BOM or (fallback) quotation legacy
    if (challanData.order_id) {
        const order = await Order.findOne({
            where: { id: challanData.order_id, deleted_at: null },
            attributes: ["id", "bom_snapshot"],
            include: [
                {
                    model: db.Quotation,
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
        });

        if (!order) {
            const error = new Error("Order not found");
            error.statusCode = 404;
            throw error;
        }

        const previousChallans = await Challan.findAll({
            where: { order_id: challanData.order_id, deleted_at: null },
            include: [
                { model: ChallanItems, as: "items", attributes: ["product_id", "quantity"] },
            ],
        });

        const previousQuantities = {};
        previousChallans.forEach((c) => {
            (c.items || []).forEach((it) => {
                const pid = it.product_id;
                previousQuantities[pid] = (previousQuantities[pid] || 0) + parseFloat(it.quantity);
            });
        });

        const useBomSnapshot = Array.isArray(order.bom_snapshot) && order.bom_snapshot.length > 0;

        if (useBomSnapshot) {
            const bomByProductId = {};
            order.bom_snapshot.forEach((line) => {
                bomByProductId[line.product_id] = { quantity: parseFloat(line.quantity) || 0, line };
            });
            for (const item of items) {
                const ordered = bomByProductId[item.product_id];
                if (!ordered) {
                    const error = new Error(`Product id ${item.product_id} is not in order BOM`);
                    error.statusCode = 400;
                    throw error;
                }
                const previousQty = previousQuantities[item.product_id] || 0;
                const currentQty = parseFloat(item.quantity) || 0;
                const totalQty = previousQty + currentQty;
                if (totalQty > ordered.quantity) {
                    const error = new Error(
                        `Total quantity for product id ${item.product_id} (${totalQty}) exceeds order BOM quantity (${ordered.quantity}). Previous challan: ${previousQty}, Current: ${currentQty}`
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

    // Auto-complete delivery stage if pending
    if (challanData.order_id) {
        const order = await Order.findOne({
            where: { id: challanData.order_id, deleted_at: null },
        });

        if (order && order.stages && order.stages.delivery === "pending") {
            // Mark delivery as complete and unlock fabrication
            const updatedStages = {
                ...order.stages,
                delivery: "completed",
                fabrication: "pending",
            };

            await order.update({
                stages: updatedStages,
                current_stage_key: "fabrication"
            }, { transaction });
        }

        await updateOrderBomShippedQuantities(challanData.order_id, transaction);
    }

    // Fetch created challan with items
    return await getChallanById({ id: challan.id });
};

/**
 * Update challan
 */
const updateChallan = async ({ id, payload, transaction } = {}) => {
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
const deleteChallan = async ({ id, transaction } = {}) => {
    const challan = await Challan.findOne({
        where: { id, deleted_at: null },
    });

    if (!challan) {
        throw new Error("Challan not found");
    }

    const orderId = challan.order_id;
    await challan.destroy({ transaction });

    if (orderId) {
        await updateOrderBomShippedQuantities(orderId, transaction);
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
    const order = await Order.findOne({
        where: { id: order_id, deleted_at: null },
        attributes: ["id", "bom_snapshot"],
        include: [
            {
                model: db.Quotation,
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
    const order = await Order.findOne({
        where: { id: order_id, deleted_at: null },
        attributes: ["id", "bom_snapshot"],
        include: [
            {
                model: db.Quotation,
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
    challans.forEach((c) => {
        (c.items || []).forEach((it) => {
            const pid = it.product_id;
            deliveredByProductId[pid] = (deliveredByProductId[pid] || 0) + parseFloat(it.quantity);
        });
    });

    const useBomSnapshot = Array.isArray(order.bom_snapshot) && order.bom_snapshot.length > 0;

    if (useBomSnapshot) {
        const status = {};
        order.bom_snapshot.forEach((line) => {
            const pid = line.product_id;
            const required = parseFloat(line.quantity) || 0;
            const delivered = deliveredByProductId[pid] || 0;
            const pending = (line.pending_qty != null && !Number.isNaN(Number(line.pending_qty)))
                ? Number(line.pending_qty)
                : Math.max(0, required - delivered);
            status[pid] = {
                required,
                delivered,
                pending,
                status: delivered >= required ? "complete" : delivered > 0 ? "partial" : "pending",
            };
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
};
