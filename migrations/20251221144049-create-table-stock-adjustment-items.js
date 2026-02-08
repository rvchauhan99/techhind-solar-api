"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("stock_adjustment_items", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      stock_adjustment_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "stock_adjustments",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "products",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      tracking_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      serial_required: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      adjustment_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      adjustment_direction: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("stock_adjustment_items");
  },
};

