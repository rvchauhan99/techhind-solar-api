"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("time_slots", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      time_value: { type: Sequelize.STRING, allowNull: false },
      display_order: { type: Sequelize.INTEGER, allowNull: false },
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
    await queryInterface.dropTable("time_slots");
  },
};


