"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("challan_item_serials", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      challan_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "challans", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      challan_item_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "challan_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      order_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      product_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "products", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      serial_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      stock_serial_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: "stock_serials", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      source: {
        type: Sequelize.ENUM("delivery_scan", "installation_force_adjust"),
        allowNull: false,
        defaultValue: "delivery_scan",
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex("challan_item_serials", ["challan_item_id", "serial_number"], {
      unique: true,
      name: "challan_item_serials_unique_active",
      where: { deleted_at: null, is_active: true },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("challan_item_serials");
  },
};
