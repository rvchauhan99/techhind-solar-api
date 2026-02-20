"use strict";

/**
 * Adds created_by and updated_by audit columns to B2B tables.
 * The models/index.js ensureAuditColumns injects these into all models,
 * but the original B2B migrations did not create these columns.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = [
      "b2b_clients",
      "b2b_client_ship_to_addresses",
      "b2b_sales_quotes",
      "b2b_sales_quote_items",
      "b2b_sales_orders",
      "b2b_sales_order_items",
      "b2b_shipments",
      "b2b_shipment_items",
      "b2b_invoices",
      "b2b_invoice_items",
    ];

    for (const table of tables) {
      const tableInfo = await queryInterface.describeTable(table).catch(() => null);
      if (!tableInfo) continue;

      const hasCreatedBy = !!tableInfo.created_by;
      const hasUpdatedBy = !!tableInfo.updated_by;

      if (!hasCreatedBy) {
        await queryInterface.addColumn(table, "created_by", {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        });
      }
      if (!hasUpdatedBy) {
        await queryInterface.addColumn(table, "updated_by", {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = [
      "b2b_clients",
      "b2b_client_ship_to_addresses",
      "b2b_sales_quotes",
      "b2b_sales_quote_items",
      "b2b_sales_orders",
      "b2b_sales_order_items",
      "b2b_shipments",
      "b2b_shipment_items",
      "b2b_invoices",
      "b2b_invoice_items",
    ];

    for (const table of tables) {
      const tableInfo = await queryInterface.describeTable(table).catch(() => null);
      if (!tableInfo) continue;

      if (tableInfo.created_by) {
        await queryInterface.removeColumn(table, "created_by").catch(() => {});
      }
      if (tableInfo.updated_by) {
        await queryInterface.removeColumn(table, "updated_by").catch(() => {});
      }
    }
  },
};
