"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");
const { MOVEMENT_TYPE } = require("../common/utils/constants.js");

const InventoryLedger = sequelize.define(
  "InventoryLedger",
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
    transaction_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    transaction_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    transaction_reference_no: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    movement_type: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        isIn: [Object.values(MOVEMENT_TYPE)],
      },
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
    },
    serial_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "stock_serials", key: "id" },
    },
    lot_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      // Future: references to stock_lots table
    },
    opening_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    closing_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    rate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    gst_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    performed_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    performed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "inventory_ledger",
    timestamps: false,
    indexes: [
      {
        fields: ["product_id", "warehouse_id"],
      },
      {
        fields: ["transaction_type", "transaction_id"],
      },
      {
        fields: ["performed_at"],
      },
    ],
  }
);

module.exports = InventoryLedger;

