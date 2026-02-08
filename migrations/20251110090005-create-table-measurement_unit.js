"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("measurement_units", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      unit: { type: Sequelize.STRING, allowNull: false },
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
    await queryInterface.dropTable("measurement_units");
  },
};


