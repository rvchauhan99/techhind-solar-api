"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const B2BShipment = sequelize.define(
  "B2BShipment",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    shipment_no: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    shipment_date: { type: DataTypes.DATEONLY, allowNull: false },
    b2b_sales_order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "b2b_sales_orders", key: "id" },
    },
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
    warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "company_warehouses", key: "id" },
    },
    transporter: { type: DataTypes.STRING(150), allowNull: true },
    vehicle_number: { type: DataTypes.STRING(50), allowNull: true },
    lr_number: { type: DataTypes.STRING(50), allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "b2b_shipments",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = B2BShipment;
