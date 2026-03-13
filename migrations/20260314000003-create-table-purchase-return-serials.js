"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("purchase_return_serials", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      purchase_return_item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "purchase_return_items",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      stock_serial_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "stock_serials",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      serial_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("purchase_return_serials");
  },
};

