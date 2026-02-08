"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("loan_types", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      type_name: { type: Sequelize.STRING, allowNull: false },
      interest_rate: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      logo: { type: Sequelize.STRING, allowNull: true },
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
    await queryInterface.dropTable("loan_types");
  },
};


