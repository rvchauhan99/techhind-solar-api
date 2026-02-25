"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "stock_serials",
      "issued_against",
      {
        type: Sequelize.STRING(50),
        allowNull: true,
      }
    );
    await queryInterface.addColumn(
      "stock_serials",
      "reference_number",
      {
        type: Sequelize.STRING(100),
        allowNull: true,
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("stock_serials", "issued_against");
    await queryInterface.removeColumn("stock_serials", "reference_number");
  },
};
