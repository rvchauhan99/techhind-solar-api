"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      password: { type: Sequelize.STRING, allowNull: true },
      google_id: { type: Sequelize.STRING, allowNull: true },
      photo: { type: Sequelize.TEXT }, // fixed typo: TYEXT → TEXT
      role_id: { type: Sequelize.INTEGER, allowNull: true }, // Manual role link
      first_login: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      address : { type: Sequelize.TEXT, allowNull: true },
      brith_date: { type: Sequelize.DATE, allowNull: true },
      blood_group: { type: Sequelize.STRING, allowNull: true },
      mobile_number : { type: Sequelize.STRING, allowNull: true },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "active",
      },
      last_login: { type: Sequelize.DATE, allowNull: true },
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
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("users");
  },
};
