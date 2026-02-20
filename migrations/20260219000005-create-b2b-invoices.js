"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("b2b_invoices", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      invoice_no: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      invoice_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      b2b_shipment_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: "b2b_shipments", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
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
      billing_gstin: { type: Sequelize.STRING(20), allowNull: true },
      place_of_supply: { type: Sequelize.STRING(100), allowNull: true },
      gst_type: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      taxable_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      total_gst_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      round_off: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      grand_total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "POSTED",
      },
      remarks: { type: Sequelize.TEXT, allowNull: true },
      created_by: {
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

    await queryInterface.createTable("b2b_invoice_items", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      b2b_invoice_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "b2b_invoices", key: "id" },
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
      unit_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
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
    await queryInterface.dropTable("b2b_invoice_items");
    await queryInterface.dropTable("b2b_invoices");
  },
};
