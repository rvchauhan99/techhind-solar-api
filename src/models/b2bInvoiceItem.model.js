"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const B2BInvoiceItem = sequelize.define(
  "B2BInvoiceItem",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    b2b_invoice_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "b2b_invoices", key: "id" },
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "products", key: "id" },
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    unit_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    discount_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    gst_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    hsn_code: { type: DataTypes.STRING(50), allowNull: true },
    // Snapshot fields (to print invoice without joins)
    product_name: { type: DataTypes.STRING(255), allowNull: true },
    product_code: { type: DataTypes.STRING(100), allowNull: true },
    uom_name: { type: DataTypes.STRING(50), allowNull: true },
    product_type_name: { type: DataTypes.STRING(100), allowNull: true },
    taxable_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    gst_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    cgst_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    sgst_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    igst_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    total_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "b2b_invoice_items",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = B2BInvoiceItem;
