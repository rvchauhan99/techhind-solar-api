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
        fields: ["stock_serial_id"],
      },
    ],
  }
);

module.exports = StockAdjustmentSerial;

