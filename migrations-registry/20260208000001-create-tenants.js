"use strict";

const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("tenants", {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      tenant_key: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      mode: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      db_host: { type: DataTypes.TEXT, allowNull: true },
      db_port: { type: DataTypes.INTEGER, allowNull: true },
      db_name: { type: DataTypes.TEXT, allowNull: true },
      db_user: { type: DataTypes.TEXT, allowNull: true },
      db_password_encrypted: { type: DataTypes.TEXT, allowNull: true },
      bucket_provider: { type: DataTypes.TEXT, allowNull: true },
      bucket_name: { type: DataTypes.TEXT, allowNull: true },
      bucket_access_key_encrypted: { type: DataTypes.TEXT, allowNull: true },
      bucket_secret_key_encrypted: { type: DataTypes.TEXT, allowNull: true },
      bucket_region: { type: DataTypes.TEXT, allowNull: true },
      bucket_endpoint: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });
    await queryInterface.sequelize.query(
      "ALTER TABLE tenants ADD CONSTRAINT tenants_mode_check CHECK (mode IN ('shared', 'dedicated'))"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE tenants ADD CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended'))"
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_mode_check");
    await queryInterface.sequelize.query("ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_check");
    await queryInterface.dropTable("tenants");
  },
};
