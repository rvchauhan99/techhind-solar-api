"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const PurchaseReturnItem = sequelize.define(
  "PurchaseReturnItem",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    purchase_return_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "purchase_returns", key: "id" },
    },
    po_inward_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "po_inward_items", key: "id" },
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
    inward_accepted_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Total accepted quantity in source PO inward line",
    },
    already_returned_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Quantity previously returned against this inward line (for info only)",
    },
    return_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
    tableName: "purchase_return_items",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = PurchaseReturnItem;

