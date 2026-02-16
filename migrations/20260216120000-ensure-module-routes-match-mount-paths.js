"use strict";

/**
 * Ensures existing modules have route set to match API mount paths so that
 * requireModulePermissionByMethod({ moduleRoute: "/masters" }) etc. can resolve.
 * Updates by key; if a module exists with the given key, set its route to the mount path.
 */
module.exports = {
  async up(queryInterface) {
    const keyToRoute = [
      { key: "masters", route: "/masters" },
      { key: "modules", route: "/module-master" },
      { key: "roles", route: "/role-master" },
      { key: "role_modules", route: "/role-module" },
      { key: "users_master", route: "/user-master" },
      { key: "company_profile", route: "/company" },
      { key: "site_visit", route: "/site-visit" },
      { key: "site_survey", route: "/site-survey" },
      { key: "followup", route: "/followup" },
      { key: "inquiry_documents", route: "/inquiry-documents" },
      { key: "order_documents", route: "/order-documents" },
      { key: "product", route: "/product" },
      { key: "bill_of_materials", route: "/bill-of-material" },
      { key: "project_price_list", route: "/project-price" },
      { key: "quotation", route: "/quotation" },
      { key: "supplier", route: "/supplier" },
      { key: "purchase_orders", route: "/purchase-orders" },
      { key: "po_inwards", route: "/po-inwards" },
      { key: "stocks", route: "/stocks" },
      { key: "inventory_ledger", route: "/inventory-ledger" },
      { key: "stock_transfers", route: "/stock-transfers" },
      { key: "stock_adjustments", route: "/stock-adjustments" },
      { key: "serialized_inventory", route: "/reports/serialized-inventory" },
      { key: "delivery_report", route: "/reports/deliveries" },
      { key: "billing", route: "/billing" },
      { key: "admin", route: "/admin" },
      { key: "inquiry", route: "/inquiry" },
      { key: "pending_orders", route: "/order" },
      { key: "fabrication_installation", route: "/order" },
      { key: "confirm_orders", route: "/confirm-orders" },
      { key: "closed_orders", route: "/closed-orders" },
      { key: "payment_report", route: "/reports/payments" },
    ];

    for (const { key, route } of keyToRoute) {
      await queryInterface.sequelize.query(
        `UPDATE modules SET route = :route, updated_at = NOW() WHERE key = :key AND deleted_at IS NULL`,
        { replacements: { route, key } }
      );
    }

    // Challan module may be keyed as "challan" or similar
    const [challanRows] = await queryInterface.sequelize.query(
      `SELECT id FROM modules WHERE (key = 'challan' OR LOWER(name) LIKE '%challan%') AND deleted_at IS NULL LIMIT 1`
    );
    if (challanRows.length > 0) {
      await queryInterface.sequelize.query(
        `UPDATE modules SET route = '/challan', updated_at = NOW() WHERE id = :id`,
        { replacements: { id: challanRows[0].id } }
      );
    }
  },

  async down() {
    // No safe way to revert route values; leave as-is
  },
};
