"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const PurchaseReturnSerial = sequelize.define(
  "PurchaseReturnSerial",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    purchase_return_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "purchase_return_items", key: "id" },
    },
    stock_serial_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "stock_serials", key: "id" },
    },
    serial_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
  },
  {
    tableName: "purchase_return_serials",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = PurchaseReturnSerial;

