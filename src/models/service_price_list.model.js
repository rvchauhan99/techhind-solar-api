"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const ServicePriceList = sequelize.define(
  "ServicePriceList",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    description: { type: DataTypes.STRING, allowNull: false },
    long_description: { type: DataTypes.STRING, allowNull: true }, // file path
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    unit_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "measurement_units", key: "id" },
    },
    gst_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "service_price_lists",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = ServicePriceList;


