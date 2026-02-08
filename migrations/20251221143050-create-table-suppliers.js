"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("suppliers", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      supplier_code: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      supplier_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      contact_person: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      city: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      state_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "states",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      pincode: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      gstin: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      pan_number: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
    await queryInterface.dropTable("suppliers");
  },
};

