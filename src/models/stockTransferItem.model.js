"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const StockTransferItem = sequelize.define(
  "StockTransferItem",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    stock_transfer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "stock_transfers", key: "id" },
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "products", key: "id" },
    },
    tracking_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [["SERIAL", "NONE"]],
      },
    },
    serial_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    transfer_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "stock_transfer_items",
    timestamps: false,
  }
);

module.exports = StockTransferItem;

