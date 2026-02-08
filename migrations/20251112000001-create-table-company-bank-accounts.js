"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("company_bank_accounts", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      
      company_id: { 
        type: Sequelize.INTEGER, 
        allowNull: false,
        references: {
          model: "companies",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      
      // Bank Details
      bank_name: { type: Sequelize.STRING, allowNull: false },
      bank_account_name: { type: Sequelize.STRING, allowNull: false },
      bank_account_number: { type: Sequelize.STRING, allowNull: false },
      bank_account_ifsc: { type: Sequelize.STRING, allowNull: true },
      bank_account_branch: { type: Sequelize.STRING, allowNull: true },
      
      // Status
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("company_bank_accounts");
  },
};

