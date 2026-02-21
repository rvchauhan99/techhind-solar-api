"use strict";

/** Extend access_token and refresh_token to TEXT to support JWTs with tenant_id and other claims (can exceed 255 chars). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("user_tokens", "access_token", {
      type: Sequelize.TEXT,
      allowNull: false,
    });
    await queryInterface.changeColumn("user_tokens", "refresh_token", {
      type: Sequelize.TEXT,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("user_tokens", "access_token", {
      type: Sequelize.STRING(255),
      allowNull: false,
    });
    await queryInterface.changeColumn("user_tokens", "refresh_token", {
      type: Sequelize.STRING(255),
      allowNull: false,
    });
  },
};
