"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("predefine_documents", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      page_name: { type: Sequelize.STRING, allowNull: false },
      page_url: { type: Sequelize.STRING, allowNull: false },
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
    await queryInterface.dropTable("predefine_documents");
  },
};


