"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const NotificationTemplate = sequelize.define(
  "NotificationTemplate",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    notification_key: { type: DataTypes.STRING, allowNull: false },
    notification_header: { type: DataTypes.STRING, allowNull: false },
    notification_message: { type: DataTypes.STRING, allowNull: false },
    redirect_url: { type: DataTypes.STRING, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "notification_templates",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = NotificationTemplate;


