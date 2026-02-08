"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const ServicePriority = sequelize.define(
  "ServicePriority",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    priority: { type: DataTypes.STRING, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "service_priorities",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = ServicePriority;


