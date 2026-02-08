"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("stock_adjustment_serials", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      stock_adjustment_item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "stock_adjustment_items",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      stock_serial_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "stock_serials",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Add unique constraint on stock_serial_id
    await queryInterface.addConstraint("stock_adjustment_serials", {
      fields: ["stock_serial_id"],
      type: "unique",
      name: "stock_adjustment_serials_stock_serial_id_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("stock_adjustment_serials");
  },
};

