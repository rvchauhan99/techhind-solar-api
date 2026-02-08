"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("project_prices", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      state_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "states", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      project_for_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "project_schemes", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      order_type_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "order_types", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      bill_of_material_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "bill_of_materials", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      project_capacity: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      price_per_kwa: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      total_project_value: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      state_subsidy: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      structure_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      netmeter_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      subsidy_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      system_warranty: { type: Sequelize.STRING, allowNull: true },
      is_locked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("project_prices");
  },
};
