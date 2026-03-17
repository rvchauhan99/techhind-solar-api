"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Quotes
    const quotesTable = await queryInterface.describeTable("b2b_sales_quotes");
    if (!quotesTable.terms_remarks) {
      await queryInterface.addColumn("b2b_sales_quotes", "terms_remarks", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    // Orders
    const ordersTable = await queryInterface.describeTable("b2b_sales_orders");
    if (!ordersTable.terms_remarks) {
      await queryInterface.addColumn("b2b_sales_orders", "terms_remarks", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const quotesTable = await queryInterface.describeTable("b2b_sales_quotes");
    if (quotesTable.terms_remarks) {
      await queryInterface.removeColumn("b2b_sales_quotes", "terms_remarks");
    }

    const ordersTable = await queryInterface.describeTable("b2b_sales_orders");
    if (ordersTable.terms_remarks) {
      await queryInterface.removeColumn("b2b_sales_orders", "terms_remarks");
    }
  },
};

