"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("customers", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      customer_name: { type: Sequelize.STRING },
      mobile_number: { type: Sequelize.STRING },
      company_name: { type: Sequelize.STRING },
      phone_no: { type: Sequelize.STRING },
      email_id: { type: Sequelize.STRING },
      pin_code: { type: Sequelize.STRING },
      state_id: { type: Sequelize.BIGINT },
      city_id: { type: Sequelize.BIGINT },
      address: { type: Sequelize.TEXT },
      landmark_area: { type: Sequelize.STRING },
      taluka: { type: Sequelize.STRING },
      district: { type: Sequelize.STRING },
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
    await queryInterface.dropTable("customers");
  },
};
