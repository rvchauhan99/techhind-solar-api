"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("notification_templates", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      notification_key: { type: Sequelize.STRING, allowNull: false },
      notification_header: { type: Sequelize.STRING, allowNull: false },
      notification_message: { type: Sequelize.STRING, allowNull: false },
      redirect_url: { type: Sequelize.STRING, allowNull: true },
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
    await queryInterface.dropTable("notification_templates");
  },
};


