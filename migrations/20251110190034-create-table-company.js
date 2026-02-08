"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("companies", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },

      // Basic Info
      company_code: { type: Sequelize.STRING, allowNull: false, unique: true },
      company_name: { type: Sequelize.STRING, allowNull: false },
      logo: { type: Sequelize.STRING, allowNull: true },
      header: { type: Sequelize.STRING, allowNull: true },
      footer: { type: Sequelize.STRING, allowNull: true },
      stamp: { type: Sequelize.STRING, allowNull: true },

      // Owner Info
      owner_name: { type: Sequelize.STRING, allowNull: true },
      owner_number: { type: Sequelize.STRING, allowNull: true },
      owner_email: { type: Sequelize.STRING, allowNull: true },

      // Registered Office
      address: { type: Sequelize.TEXT, allowNull: true },
      city: { type: Sequelize.STRING, allowNull: true },
      state: { type: Sequelize.STRING, allowNull: true },
      contact_number: { type: Sequelize.STRING, allowNull: true },
      company_email: { type: Sequelize.STRING, allowNull: true },
      company_website: { type: Sequelize.STRING, allowNull: true },

      // Plan Info
      user_limit_used: { type: Sequelize.INTEGER, defaultValue: 0 },
      user_limit_total: { type: Sequelize.INTEGER, defaultValue: 0 },
      plan_valid_till: { type: Sequelize.DATEONLY, allowNull: true },
      sms_credit_used: { type: Sequelize.INTEGER, defaultValue: 0 },
      sms_credit_total: { type: Sequelize.INTEGER, defaultValue: 0 },

      // Status
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "active",
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
    await queryInterface.dropTable("companies");
  },
};
