"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const MeasurementUnit = sequelize.define(
  "MeasurementUnit",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    unit: { type: DataTypes.STRING, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "measurement_units",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = MeasurementUnit;


