"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const POInwardItem = sequelize.define(
  "POInwardItem",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    po_inward_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "po_inwards", key: "id" },
    },
    purchase_order_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "purchase_order_items", key: "id" },
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
        isIn: [["SERIAL", "LOT"]],
      },
    },
    serial_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    ordered_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    received_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    accepted_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    rejected_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    rate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    gst_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    taxable_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    gst_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    total_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "po_inward_items",
    timestamps: false,
  }
);

module.exports = POInwardItem;

