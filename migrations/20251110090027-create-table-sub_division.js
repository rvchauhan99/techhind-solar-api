"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("sub_divisions", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false },
      division_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "divisions", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      contact_person_name: { type: Sequelize.STRING, allowNull: true },
      mobile_number: { type: Sequelize.STRING, allowNull: true },
      email_id: { type: Sequelize.STRING, allowNull: true },
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
    await queryInterface.dropTable("sub_divisions");
  },
};


