"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const B2BClientShipTo = sequelize.define(
  "B2BClientShipTo",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "b2b_clients", key: "id" },
    },
    ship_to_code: { type: DataTypes.STRING(50), allowNull: true },
    ship_to_name: { type: DataTypes.STRING(255), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: false },
    city: { type: DataTypes.STRING(100), allowNull: true },
    district: { type: DataTypes.STRING(100), allowNull: true },
    state: { type: DataTypes.STRING(100), allowNull: true },
    pincode: { type: DataTypes.STRING(20), allowNull: true },
    landmark: { type: DataTypes.STRING(255), allowNull: true },
    country: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: "India",
    },
    contact_person: { type: DataTypes.STRING(150), allowNull: true },
    phone: { type: DataTypes.STRING(50), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: true },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "b2b_client_ship_to_addresses",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = B2BClientShipTo;
