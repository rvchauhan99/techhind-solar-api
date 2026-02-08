"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("planner_autos", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      task_category_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "task_planner_categories", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      task_key: { type: Sequelize.STRING, allowNull: false },
      title: { type: Sequelize.STRING, allowNull: false },
      details: { type: Sequelize.STRING, allowNull: false },
      task_priority_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "task_priorities", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      task_complete_days: { type: Sequelize.INTEGER, allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
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
    await queryInterface.dropTable("planner_autos");
  },
};


