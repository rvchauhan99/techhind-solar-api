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

    // Validate quantities against quotation
    if (challanData.order_id) {
        // Fetch order with quotation
        const order = await Order.findOne({
            where: { id: challanData.order_id, deleted_at: null },
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

        if (order.quotation) {
            // Product types that need validation
            const validatableTypes = [
                "panel",
                "inverter",
                "hybrid_inverter",
                "battery",
                "acdb",
                "dcdb",
                "ac_cable",
                "dc_cable",
                "earthing",
                "la",
            ];

            // Map product type to quotation field
            const typeToQuotationField = {
                panel: "panel_quantity",
                inverter: "inverter_quantity",
                hybrid_inverter: "hybrid_inverter_quantity",
                battery: "battery_quantity",
                acdb: "acdb_quantity",
                dcdb: "dcdb_quantity",
                ac_cable: "cable_ac_quantity",
                dc_cable: "cable_dc_quantity",
                earthing: "earthing_quantity",
                la: "la_quantity",
            };

            // Fetch product details for items
            const productIds = items.map(item => item.product_id);
            const products = await Product.findAll({
                where: { id: productIds, deleted_at: null },
                include: [
                    {
                        model: ProductType,
                        as: "productType",
                        attributes: ["id", "name"],
                    },
                ],
            });

            // Create a map of product_id to product
            const productMap = {};
            products.forEach(p => {
                productMap[p.id] = p;
            });

            // Fetch all previous challans for this order
            const previousChallans = await Challan.findAll({
                where: { order_id: challanData.order_id, deleted_at: null },
                include: [
                    {
                        model: ChallanItems,
                        as: "items",
                        attributes: ["product_id", "quantity"],
                    },
                ],
            });

            // Calculate total quantities per product from previous challans
            const previousQuantities = {};
            previousChallans.forEach(challan => {
                if (challan.items) {
                    challan.items.forEach(item => {
                        if (!previousQuantities[item.product_id]) {
                            previousQuantities[item.product_id] = 0;
                        }
                        previousQuantities[item.product_id] += parseFloat(item.quantity);
                    });
                }
            });

            // Validate each item
            for (const item of items) {
                const product = productMap[item.product_id];
                if (!product || !product.productType) {
                    continue; // Skip if product not found
                }

                const productTypeName = product.productType.name.toLowerCase().replace(/\s+/g, "_");

                // Check if this product type needs validation
                if (validatableTypes.includes(productTypeName)) {
                    const quotationField = typeToQuotationField[productTypeName];
                    const quotationQty = order.quotation[quotationField];

                    if (quotationQty !== null && quotationQty !== undefined) {
                        // Calculate total quantity (previous + current)
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

    await challan.destroy({ transaction });

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
 */
const getQuotationProductsByOrderId = async ({ order_id } = {}) => {
    const order = await Order.findOne({
        where: { id: order_id, deleted_at: null },
        include: [
            {
                model: db.Quotation,
                as: "quotation",
                attributes: [
                    "id",
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

    if (!order.quotation) {
        return { products: [] };
    }

    // Extract product IDs from quotation
    const productIds = [
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
    ].filter(id => id != null && id !== undefined);

    if (productIds.length === 0) {
        return { products: [] };
    }

    // Fetch products
    const products = await Product.findAll({
        where: {
            id: productIds,
            deleted_at: null,
        },
        include: [
            {
                model: ProductType,
                as: "productType",
                attributes: ["id", "name"],
            },
        ],
    });

    return { products };
};

/**
 * Get delivery status for an order
 * Compares challan quantities with quotation quantities for each product type
 */
const getDeliveryStatus = async ({ order_id } = {}) => {
    // Fetch order with quotation
    const order = await Order.findOne({
        where: { id: order_id, deleted_at: null },
        include: [
            {
                model: db.Quotation,
                as: "quotation",
                attributes: [
                    "id",
                    // Product IDs
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
                    // Quantities (some products may not have these)
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
        throw new Error("Order not found");
    }

    if (!order.quotation) {
        return { status: {} };
    }

    // Fetch all challans for this order
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

    // Product type mapping for quantities
    const typeToQuotationField = {
        panel: "panel_quantity",
        inverter: "inverter_quantity",
        hybrid_inverter: "hybrid_inverter_quantity",
        battery: "battery_quantity",
        acdb: "acdb_quantity",
        dcdb: "dcdb_quantity",
        ac_cable: "cable_ac_quantity",
        dc_cable: "cable_dc_quantity",
        earthing: "earthing_quantity",
        la: "la_quantity",
    };

    // Product type to product ID mapping
    const typeToProductField = {
        structure: "structure_product",
        panel: "panel_product",
        inverter: "inverter_product",
        battery: "battery_product",
        hybrid_inverter: "hybrid_inverter_product",
        acdb: "acdb_product",
        dcdb: "dcdb_product",
        ac_cable: "cable_ac_product",
        dc_cable: "cable_dc_product",
        earthing: "earthing_product",
        la: "la_product",
    };

    // Calculate delivered quantities per product type
    const deliveredQuantities = {};

    challans.forEach(challan => {
        if (challan.items) {
            challan.items.forEach(item => {
                if (item.product && item.product.productType) {
                    const productTypeName = item.product.productType.name.toLowerCase().replace(/\s+/g, "_");

                    if (!deliveredQuantities[productTypeName]) {
                        deliveredQuantities[productTypeName] = 0;
                    }
                    deliveredQuantities[productTypeName] += parseFloat(item.quantity);
                }
            });
        }
    });

    // Build status object
    const status = {};

    // Check each product type
    Object.keys(typeToProductField).forEach(type => {
        const productField = typeToProductField[type];
        const quotationField = typeToQuotationField[type];
        const productId = order.quotation[productField];

        // Only include if product exists in quotation
        if (productId !== null && productId !== undefined) {
            const deliveredQty = deliveredQuantities[type] || 0;

            // Check if this product type has a quantity field
            if (quotationField && order.quotation[quotationField] !== null && order.quotation[quotationField] !== undefined) {
                // Has quantity field - compare delivered vs required
                const requiredQty = order.quotation[quotationField];
                if (requiredQty > 0) {
                    status[type] = {
                        required: parseFloat(requiredQty),
                        delivered: deliveredQty,
                        status: deliveredQty >= parseFloat(requiredQty) ? "complete" : deliveredQty > 0 ? "partial" : "pending"
                    };
                }
            } else {
                // No quantity field - mark as complete if any challan exists
                status[type] = {
                    required: null,
                    delivered: deliveredQty,
                    status: deliveredQty > 0 ? "complete" : "pending"
                };
            }
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
