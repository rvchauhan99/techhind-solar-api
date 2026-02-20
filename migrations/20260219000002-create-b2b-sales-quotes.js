"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("b2b_sales_quotes", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      quote_no: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      quote_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      valid_till: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "b2b_clients", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      ship_to_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "b2b_client_ship_to_addresses", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      payment_terms: { type: Sequelize.STRING(100), allowNull: true },
      delivery_terms: { type: Sequelize.STRING(100), allowNull: true },
      subtotal_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total_gst_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      grand_total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "DRAFT",
      },
      converted_to_so: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      sales_order_id: { type: Sequelize.INTEGER, allowNull: true },
      remarks: { type: Sequelize.TEXT, allowNull: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      approved_by: { type: Sequelize.INTEGER, allowNull: true },
      approved_at: { type: Sequelize.DATE, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.createTable("b2b_sales_quote_items", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      b2b_sales_quote_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "b2b_sales_quotes", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "products", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      unit_rate: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      discount_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      gst_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      hsn_code: { type: Sequelize.STRING(50), allowNull: true },
      taxable_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      gst_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      total_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      remarks: { type: Sequelize.TEXT, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("b2b_sales_quote_items");
    await queryInterface.dropTable("b2b_sales_quotes");
  },
};
