"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const WhatsappTemplate = sequelize.define(
  "WhatsappTemplate",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    template_key: { type: DataTypes.STRING, allowNull: false },
    whatsapp_key: { type: DataTypes.STRING, allowNull: false },
    default_header_value: { type: DataTypes.STRING, allowNull: true },
    header_format: { type: DataTypes.STRING, allowNull: true },
    default_button_value: { type: DataTypes.STRING, allowNull: true },
    language: { type: DataTypes.STRING, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "whatsapp_templates",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = WhatsappTemplate;


