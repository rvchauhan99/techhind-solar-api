"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "inventory_ledger",
      "transaction_reference_no",
      {
        type: Sequelize.STRING(100),
        allowNull: true,
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("inventory_ledger", "transaction_reference_no");
  },
};
