"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("b2b_clients", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      client_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      client_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      client_type: {
        type: Sequelize.STRING(30),
        allowNull: true,
        defaultValue: "B2B",
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      contact_person: { type: Sequelize.STRING(150), allowNull: true },
      phone: { type: Sequelize.STRING(50), allowNull: true },
      email: { type: Sequelize.STRING(150), allowNull: true },
      gstin: { type: Sequelize.STRING(20), allowNull: true },
      pan_number: { type: Sequelize.STRING(20), allowNull: true },
      gst_registration_type: { type: Sequelize.STRING(30), allowNull: true },
      credit_limit: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      credit_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      billing_address: { type: Sequelize.TEXT, allowNull: true },
      billing_city: { type: Sequelize.STRING(100), allowNull: true },
      billing_state: { type: Sequelize.STRING(100), allowNull: true },
      billing_pincode: { type: Sequelize.STRING(20), allowNull: true },
      billing_country: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: "India",
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

    await queryInterface.createTable("b2b_client_ship_to_addresses", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      client_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "b2b_clients", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      ship_to_code: { type: Sequelize.STRING(50), allowNull: true },
      ship_to_name: { type: Sequelize.STRING(255), allowNull: true },
      address: { type: Sequelize.TEXT, allowNull: false },
      city: { type: Sequelize.STRING(100), allowNull: true },
      state: { type: Sequelize.STRING(100), allowNull: true },
      pincode: { type: Sequelize.STRING(20), allowNull: true },
      country: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: "India",
      },
      contact_person: { type: Sequelize.STRING(150), allowNull: true },
      phone: { type: Sequelize.STRING(50), allowNull: true },
      email: { type: Sequelize.STRING(150), allowNull: true },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex("b2b_client_ship_to_addresses", {
      fields: ["client_id", "ship_to_code"],
      unique: true,
      name: "b2b_client_ship_to_client_code_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("b2b_client_ship_to_addresses");
    await queryInterface.dropTable("b2b_clients");
  },
};
