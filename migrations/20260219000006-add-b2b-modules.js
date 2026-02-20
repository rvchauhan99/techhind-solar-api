"use strict";

/**
 * Adds B2B Trading modules for permission checks.
 */
module.exports = {
  async up(queryInterface) {
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
      { key: "b2b_trading", name: "B2B Trading", route: "/b2b", parentKey: null, icon: "business" },
      { key: "b2b_clients", name: "B2B Clients", route: "/b2b-clients", parentKey: "b2b_trading", icon: "people" },
      { key: "b2b_sales_quotes", name: "B2B Sales Quotes", route: "/b2b-sales-quotes", parentKey: "b2b_trading", icon: "description" },
      { key: "b2b_sales_orders", name: "B2B Sales Orders", route: "/b2b-sales-orders", parentKey: "b2b_trading", icon: "shopping_cart" },
      { key: "b2b_shipments", name: "B2B Shipments", route: "/b2b-shipments", parentKey: "b2b_trading", icon: "local_shipping" },
      { key: "b2b_invoices", name: "B2B Invoices", route: "/b2b-invoices", parentKey: "b2b_trading", icon: "receipt" },
    ];

    for (const mod of modulesToEnsure) {
      const [existingByKey] = await queryInterface.sequelize.query(
        `SELECT id FROM modules WHERE key = :key AND deleted_at IS NULL LIMIT 1`,
        { replacements: { key: mod.key } }
      );
      if (existingByKey.length > 0) {
        parentMap[mod.key] = existingByKey[0].id;
        continue;
      }

      const parentId = mod.parentKey ? (parentMap[mod.parentKey] || null) : null;
      const [inserted] = await queryInterface.sequelize.query(
        `INSERT INTO modules (name, key, parent_id, icon, route, status, sequence, created_at, updated_at)
         VALUES (:name, :key, :parent_id, :icon, :route, 'active', :seq, :now, :now)
         RETURNING id`,
        {
          replacements: {
            name: mod.name,
            key: mod.key,
            parent_id: parentId,
            icon: mod.icon,
            route: mod.route,
            seq: sequence++,
            now,
          },
        }
      );
      if (inserted && inserted.length > 0) {
        parentMap[mod.key] = inserted[0].id;
      }
    }
  },

  async down(queryInterface) {
    const keysToRemove = [
      "b2b_invoices",
      "b2b_shipments",
      "b2b_sales_orders",
      "b2b_sales_quotes",
      "b2b_clients",
      "b2b_trading",
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
