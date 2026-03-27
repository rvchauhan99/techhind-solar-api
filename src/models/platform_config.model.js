"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const PlatformConfig = sequelize.define(
  "PlatformConfig",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    config_key: { type: DataTypes.STRING(191), allowNull: false, unique: true },
    config_value: { type: DataTypes.TEXT, allowNull: false },
    value_type: {
      type: DataTypes.ENUM("string", "number", "boolean", "json"),
      allowNull: false,
      defaultValue: "string",
    },
    description: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    updated_by: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "platform_configs",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = PlatformConfig;
