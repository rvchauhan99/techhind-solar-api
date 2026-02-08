"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("company_warehouse_managers", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      warehouse_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "company_warehouses", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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
    });
    await queryInterface.addIndex("company_warehouse_managers", ["warehouse_id", "user_id"], {
      unique: true,
      name: "company_warehouse_managers_warehouse_id_user_id_key",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("company_warehouse_managers");
  },
};
