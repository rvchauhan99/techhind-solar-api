"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("b2b_sales_orders", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      order_no: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      order_date: {
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
      quote_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "b2b_sales_quotes", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      payment_terms: { type: Sequelize.STRING(100), allowNull: true },
      delivery_terms: { type: Sequelize.STRING(100), allowNull: true },
      planned_warehouse_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "company_warehouses", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
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
      remarks: { type: Sequelize.TEXT, allowNull: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
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

    await queryInterface.createTable("b2b_sales_order_items", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      b2b_sales_order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "b2b_sales_orders", key: "id" },
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
      shipped_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
    await queryInterface.dropTable("b2b_sales_order_items");
    await queryInterface.dropTable("b2b_sales_orders");
  },
};
