"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const B2BSalesOrder = sequelize.define(
  "B2BSalesOrder",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    order_no: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    order_date: { type: DataTypes.DATEONLY, allowNull: false },
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
    quote_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "b2b_sales_quotes", key: "id" },
    },
    payment_terms: { type: DataTypes.STRING(100), allowNull: true },
    delivery_terms: { type: DataTypes.STRING(100), allowNull: true },
    planned_warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "company_warehouses", key: "id" },
    },
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
    remarks: { type: DataTypes.TEXT, allowNull: true },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "b2b_sales_orders",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = B2BSalesOrder;
