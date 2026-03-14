"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("company_bank_accounts", "branch_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "company_branches", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("company_bank_accounts", "branch_id");
  },
};
