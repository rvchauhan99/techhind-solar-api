"use strict";

/**
 * Get product fields from a BOM line (supports both nested and flat format).
 * - Nested: line.product_snapshot contains product fields
 * - Flat: product fields are directly on line
 * @param {object} line - BOM line item
 * @returns {object|null} Product fields or null
 */
function getBomLineProduct(line) {
    if (!line) return null;
    return line.product_snapshot || line;
}

/**
 * Normalize a BOM line to flat format for display/templates.
 * If line uses nested format (product_snapshot), merges those fields onto the line.
 * @param {object} line - BOM line item
 * @returns {object} Line with all product fields at top level (flat)
 */
function normalizeBomLineForDisplay(line) {
    if (!line) return null;
    const product = getBomLineProduct(line);
    if (!product) return { ...line };
    if (line.product_snapshot) {
        const { product_snapshot, ...rest } = line;
        return { ...rest, ...product_snapshot };
    }
    return { ...line };
}

/**
 * Normalize an array of BOM lines to flat format.
 * Sorts by sort_order (ascending) first so legacy and new data display in consistent order.
 * @param {Array} bomSnapshot - Array of BOM line items
 * @returns {Array} Array of flat lines
 */
function normalizeBomSnapshotForDisplay(bomSnapshot) {
    if (!Array.isArray(bomSnapshot) || bomSnapshot.length === 0) return bomSnapshot;
    const sorted = [...bomSnapshot].sort((a, b) => {
        const orderA = a.sort_order != null && !Number.isNaN(Number(a.sort_order)) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
        const orderB = b.sort_order != null && !Number.isNaN(Number(b.sort_order)) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
    });
    return sorted.map(normalizeBomLineForDisplay);
}

module.exports = {
    getBomLineProduct,
    normalizeBomLineForDisplay,
    normalizeBomSnapshotForDisplay,
};
