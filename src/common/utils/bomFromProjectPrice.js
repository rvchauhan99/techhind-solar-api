"use strict";

/**
 * Sort BOM snapshot by product_type.display_order (ascending). Reassigns sort_order 0,1,2,...
 * Lines without product_type_id or with unknown type get a high display_order (appear last).
 * @param {Array} bomSnapshot - Array of BOM lines (each has product_type_id)
 * @param {object} models - Models instance (from getTenantModels)
 * @param {object} [transaction]
 * @returns {Promise<Array>} Sorted array (same reference if length 0)
 */
const sortBomSnapshotByProductTypeDisplayOrder = async (bomSnapshot, models, transaction) => {
    if (!Array.isArray(bomSnapshot) || bomSnapshot.length === 0) return bomSnapshot;
    const { ProductType } = models;
    const typeIds = [...new Set(bomSnapshot.map((line) => line.product_type_id).filter((id) => id != null && !Number.isNaN(Number(id))))];
    const displayOrderMap = {};
    if (typeIds.length > 0) {
        const types = await ProductType.findAll({
            where: { id: typeIds },
            attributes: ["id", "display_order"],
            transaction,
        });
        types.forEach((t) => {
            displayOrderMap[t.id] = t.display_order != null ? Number(t.display_order) : Number.MAX_SAFE_INTEGER;
        });
    }
    const getOrder = (line) => {
        const id = line.product_type_id;
        if (id == null || Number.isNaN(Number(id))) return Number.MAX_SAFE_INTEGER;
        return displayOrderMap[id] !== undefined ? displayOrderMap[id] : Number.MAX_SAFE_INTEGER;
    };
    const sorted = [...bomSnapshot].sort((a, b) => {
        const orderA = getOrder(a);
        const orderB = getOrder(b);
        if (orderA !== orderB) return orderA - orderB;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    return sorted.map((line, index) => ({ ...line, sort_order: index }));
};

/**
 * Build full BOM snapshot from Project Price's BOM (all products with full params + qty).
 * Used when creating/updating quotation with project_price_id set, or when importing BOM to order in Planner.
 * @param {number} projectPriceId
 * @param {object} [transaction]
 * @param {object} models - Models instance (from getTenantModels); required
 * @returns {Promise<Array|null>} Array of { product_id, quantity, sort_order, product_snapshot } or null
 */
const buildBomSnapshotFromProjectPrice = async (projectPriceId, transaction, models) => {
    if (!models) return null;
    const { ProjectPrice, BillOfMaterial, Product, ProductType, ProductMake, MeasurementUnit } = models;
    if (!projectPriceId) return null;

    const projectPrice = await ProjectPrice.findOne({
        where: { id: projectPriceId, deleted_at: null },
        include: [
            { model: BillOfMaterial, as: "billOfMaterial", attributes: ["id", "bom_name", "bom_code", "bom_detail"] },
        ],
        transaction,
    });
    if (!projectPrice) return null;

    const data = projectPrice.toJSON();
    const bomDetail = data?.billOfMaterial?.bom_detail;
    if (!Array.isArray(bomDetail) || bomDetail.length === 0) return null;

    const productIds = [...new Set(bomDetail.map((i) => i.product_id).filter(Boolean))];
    if (productIds.length === 0) return null;

    const products = await Product.findAll({
        where: { id: productIds, deleted_at: null },
        include: [
            { model: ProductType, as: "productType", attributes: ["id", "name", "display_order"] },
            { model: ProductMake, as: "productMake", attributes: ["id", "name"] },
            { model: MeasurementUnit, as: "measurementUnit", attributes: ["id", "unit"] },
        ],
        transaction,
    });

    const productMap = {};
    products.forEach((p) => {
        const j = p.toJSON();
        productMap[p.id] = {
            id: j.id,
            product_type_id: j.product_type_id,
            product_make_id: j.product_make_id,
            product_name: j.product_name,
            product_description: j.product_description,
            hsn_ssn_code: j.hsn_ssn_code,
            measurement_unit_id: j.measurement_unit_id,
            capacity: j.capacity,
            barcode_number: j.barcode_number,
            gst_percent: j.gst_percent,
            tracking_type: j.tracking_type,
            serial_required: j.serial_required,
            properties: j.properties,
            is_active: j.is_active,
            min_stock_quantity: j.min_stock_quantity,
            created_at: j.created_at,
            updated_at: j.updated_at,
            product_type_name: j.productType?.name ?? null,
            product_make_name: j.productMake?.name ?? null,
            measurement_unit_name: j.measurementUnit?.unit ?? null,
        };
    });

    const rawSnapshot = bomDetail.map((item, index) => {
        const snapshot = productMap[item.product_id] ?? null;
        return {
            product_id: item.product_id,
            quantity: item.quantity,
            sort_order: index,
            ...(snapshot ? snapshot : {}),
        };
    });
    return sortBomSnapshotByProductTypeDisplayOrder(rawSnapshot, models, transaction);
};

module.exports = {
    buildBomSnapshotFromProjectPrice,
    sortBomSnapshotByProductTypeDisplayOrder,
};
