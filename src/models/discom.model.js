"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const Discom = sequelize.define(
  "Discom",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    name_value: { type: DataTypes.STRING, allowNull: false },
    short_name: { type: DataTypes.STRING, allowNull: false },
    state_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "states", key: "id" },
    },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "discoms",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = Discom;


