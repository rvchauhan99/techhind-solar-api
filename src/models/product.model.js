"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const Product = sequelize.define(
  "Product",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    product_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "product_types", key: "id" },
    },
    tracking_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "LOT",
    },
    serial_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    product_make_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "product_makes", key: "id" },
    },
    product_name: { type: DataTypes.STRING, allowNull: false },
    product_description: { type: DataTypes.TEXT, allowNull: true },
    hsn_ssn_code: { type: DataTypes.STRING, allowNull: true },
    measurement_unit_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "measurement_units", key: "id" },
    },
    capacity: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    barcode_number: { type: DataTypes.STRING, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // purchase_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    // selling_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    // mrp: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    gst_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    min_stock_quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    min_purchase_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    avg_purchase_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    max_purchase_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    properties: { type: DataTypes.JSON, allowNull: true },
  },
  {
    tableName: "products",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = Product;

