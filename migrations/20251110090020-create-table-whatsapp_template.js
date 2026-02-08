"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("whatsapp_templates", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      template_key: { type: Sequelize.STRING, allowNull: false },
      whatsapp_key: { type: Sequelize.STRING, allowNull: false },
      default_header_value: { type: Sequelize.STRING, allowNull: true },
      header_format: { type: Sequelize.STRING, allowNull: true },
      default_button_value: { type: Sequelize.STRING, allowNull: true },
      language: { type: Sequelize.STRING, allowNull: true },
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
    await queryInterface.dropTable("whatsapp_templates");
  },
};


