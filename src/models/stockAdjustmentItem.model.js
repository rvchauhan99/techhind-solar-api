"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");
const { MOVEMENT_TYPE } = require("../common/utils/constants.js");

const StockAdjustmentItem = sequelize.define(
  "StockAdjustmentItem",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    stock_adjustment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "stock_adjustments", key: "id" },
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
    adjustment_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
    },
    adjustment_direction: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        isIn: [Object.values(MOVEMENT_TYPE).filter((v) => v !== "ADJUST")],
      },
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "stock_adjustment_items",
    timestamps: false,
  }
);

module.exports = StockAdjustmentItem;

