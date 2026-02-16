"use strict";

/**
 * Adds modules required for mount-level permission checks (route -> moduleKey).
 * Inserts only when the module key does not already exist.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const [allParents] = await queryInterface.sequelize.query(
      `SELECT id, key FROM modules WHERE parent_id IS NULL AND deleted_at IS NULL`
    );
    const parentMap = (allParents || []).reduce((acc, row) => {
      acc[row.key] = row.id;
      return acc;
    }, {});

    const [maxSeqRows] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(sequence), 0) AS max_seq FROM modules WHERE deleted_at IS NULL`
    );
    let sequence = (maxSeqRows[0]?.max_seq || 0) + 1;

    const modulesToEnsure = [
      { key: "supplier", name: "Supplier Master", route: "/supplier", parentKey: "procurement", icon: "supplier" },
      { key: "site_survey", name: "Site Survey", route: "/site-survey", parentKey: "inquiry_management", icon: "site_survey" },
      { key: "inquiry_documents", name: "Inquiry Documents", route: "/inquiry-documents", parentKey: "inquiry_management", icon: "document" },
      { key: "order_documents", name: "Order Documents", route: "/order-documents", parentKey: "order_management", icon: "document" },
      { key: "purchase_orders", name: "Purchase Orders", route: "/purchase-orders", parentKey: "procurement", icon: "purchase_orders" },
      { key: "po_inwards", name: "PO Inwards", route: "/po-inwards", parentKey: "procurement", icon: "po_inwards" },
      { key: "stocks", name: "Stocks", route: "/stocks", parentKey: "procurement", icon: "stocks" },
      { key: "inventory_ledger", name: "Inventory Ledger", route: "/inventory-ledger", parentKey: "procurement", icon: "inventory_ledger" },
      { key: "stock_transfers", name: "Stock Transfers", route: "/stock-transfers", parentKey: "procurement", icon: "stock_transfers" },
      { key: "stock_adjustments", name: "Stock Adjustments", route: "/stock-adjustments", parentKey: "procurement", icon: "stock_adjustments" },
      { key: "serialized_inventory", name: "Serialized Inventory Report", route: "/reports/serialized-inventory", parentKey: "procurement", icon: "report" },
      { key: "delivery_report", name: "Delivery Report", route: "/reports/deliveries", parentKey: "order_management", icon: "report" },
      { key: "billing", name: "Billing", route: "/billing", parentKey: "settings", icon: "billing" },
      { key: "admin", name: "Admin", route: "/admin", parentKey: "settings", icon: "admin" },
    ];

    for (const mod of modulesToEnsure) {
      const [existingByKey] = await queryInterface.sequelize.query(
        `SELECT id FROM modules WHERE key = :key AND deleted_at IS NULL LIMIT 1`,
        { replacements: { key: mod.key } }
      );
      const [existingByName] = await queryInterface.sequelize.query(
        `SELECT id FROM modules WHERE name = :name AND deleted_at IS NULL LIMIT 1`,
        { replacements: { name: mod.name } }
      );
      if (existingByKey.length > 0 || existingByName.length > 0) continue;

      const parentId = mod.parentKey ? parentMap[mod.parentKey] || null : null;

      await queryInterface.bulkInsert("modules", [
        {
          name: mod.name,
          key: mod.key,
          parent_id: parentId,
          icon: mod.icon,
          route: mod.route,
          status: "active",
          sequence: sequence++,
          created_at: now,
          updated_at: now,
        },
      ]);
    }
  },

  async down(queryInterface, Sequelize) {
    const keysToRemove = [
      "supplier", "site_survey", "inquiry_documents", "order_documents",
      "purchase_orders", "po_inwards", "stocks", "inventory_ledger",
      "stock_transfers", "stock_adjustments", "serialized_inventory",
      "delivery_report", "billing", "admin",
    ];

    for (const key of keysToRemove) {
      const [rows] = await queryInterface.sequelize.query(
        `SELECT id FROM modules WHERE key = :key AND deleted_at IS NULL LIMIT 1`,
        { replacements: { key } }
      );
      if (rows.length > 0) {
        const moduleId = rows[0].id;
        await queryInterface.sequelize.query(
          `DELETE FROM role_modules WHERE module_id = :id`,
          { replacements: { id: moduleId } }
        );
        await queryInterface.sequelize.query(
          `DELETE FROM modules WHERE id = :id`,
          { replacements: { id: moduleId } }
        );
      }
    }
  },
};
