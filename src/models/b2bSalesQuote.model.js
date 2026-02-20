"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const B2BSalesQuote = sequelize.define(
  "B2BSalesQuote",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    quote_no: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    quote_date: { type: DataTypes.DATEONLY, allowNull: false },
    valid_till: { type: DataTypes.DATEONLY, allowNull: false },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "b2b_clients", key: "id" },
    },
    ship_to_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "b2b_client_ship_to_addresses", key: "id" },
    },
    payment_terms: { type: DataTypes.STRING(100), allowNull: true },
    delivery_terms: { type: DataTypes.STRING(100), allowNull: true },
    subtotal_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    total_gst_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    grand_total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "DRAFT",
    },
    converted_to_so: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sales_order_id: { type: DataTypes.INTEGER, allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    approved_by: { type: DataTypes.INTEGER, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "b2b_sales_quotes",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = B2BSalesQuote;
