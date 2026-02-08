"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("planner_auto_users", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      planner_auto_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "planner_autos", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("planner_auto_users");
  },
};


