"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const PurchaseReturn = sequelize.define(
  "PurchaseReturn",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    purchase_order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "purchase_orders", key: "id" },
    },
    po_inward_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "po_inwards", key: "id" },
      comment: "Null when return is against PO only (multi-inward); set when return is against specific inward",
    },
    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "suppliers", key: "id" },
    },
    warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "company_warehouses", key: "id" },
    },
    supplier_return_ref: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Supplier credit note / return reference number",
    },
    supplier_return_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    return_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "DRAFT",
    },
    total_return_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_return_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    reason_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "reasons", key: "id" },
    },
    reason_text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
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
    tableName: "purchase_returns",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = PurchaseReturn;

