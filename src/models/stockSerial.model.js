"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");
const { SERIAL_STATUS } = require("../common/utils/constants.js");

const StockSerial = sequelize.define(
  "StockSerial",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "products", key: "id" },
    },
    warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "company_warehouses", key: "id" },
    },
    stock_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "stocks", key: "id" },
    },
    serial_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: SERIAL_STATUS.AVAILABLE,
      validate: {
        isIn: [Object.values(SERIAL_STATUS)],
      },
    },
    source_type: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    source_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    inward_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    outward_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "stock_serials",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = StockSerial;

