"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const B2BSalesQuoteItem = sequelize.define(
  "B2BSalesQuoteItem",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    b2b_sales_quote_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "b2b_sales_quotes", key: "id" },
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "products", key: "id" },
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    unit_rate: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    discount_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
    gst_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    hsn_code: { type: DataTypes.STRING(50), allowNull: true },
    taxable_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    gst_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    total_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "b2b_sales_quote_items",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = B2BSalesQuoteItem;
