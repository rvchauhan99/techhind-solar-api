"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const Reason = sequelize.define(
  "Reason",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    reason_type: { type: DataTypes.STRING, allowNull: false, defaultValue: "general" },
    reason: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "reasons",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = Reason;


