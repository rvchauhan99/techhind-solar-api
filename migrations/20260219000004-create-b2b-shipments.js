"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("b2b_shipments", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      shipment_no: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      shipment_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      b2b_sales_order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "b2b_sales_orders", key: "id" },
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
      warehouse_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "company_warehouses", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      transporter: { type: Sequelize.STRING(150), allowNull: true },
      vehicle_number: { type: Sequelize.STRING(50), allowNull: true },
      lr_number: { type: Sequelize.STRING(50), allowNull: true },
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

    await queryInterface.createTable("b2b_shipment_items", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      b2b_shipment_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "b2b_shipments", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      b2b_sales_order_item_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "b2b_sales_order_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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
      serials: {
        type: Sequelize.TEXT,
        allowNull: true,
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
    await queryInterface.dropTable("b2b_shipment_items");
    await queryInterface.dropTable("b2b_shipments");
  },
};
