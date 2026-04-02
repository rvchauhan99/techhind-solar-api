"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const StockAdjustmentSerial = sequelize.define(
  "StockAdjustmentSerial",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    stock_adjustment_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "stock_adjustment_items", key: "id" },
    },
    stock_serial_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "stock_serials", key: "id" },
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "stock_adjustment_serials",
    timestamps: false,
    indexes: [
      {
        unique: true,
        // Composite unique: same serial cannot appear twice in the same item,
        // but CAN appear in different adjustments over its lifetime (lost → found → lost, etc.)
        fields: ["stock_adjustment_item_id", "stock_serial_id"],
        name: "stock_adjustment_serials_item_serial_unique",
      },
    ],
  }
);

module.exports = StockAdjustmentSerial;

