"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const B2BClient = sequelize.define(
  "B2BClient",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    client_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    client_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    client_type: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: "B2B",
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    contact_person: { type: DataTypes.STRING(150), allowNull: true },
    phone: { type: DataTypes.STRING(50), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: true },
    gstin: { type: DataTypes.STRING(20), allowNull: true },
    pan_number: { type: DataTypes.STRING(20), allowNull: true },
    gst_registration_type: { type: DataTypes.STRING(30), allowNull: true },
    credit_limit: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    credit_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    billing_address: { type: DataTypes.TEXT, allowNull: true },
    billing_city: { type: DataTypes.STRING(100), allowNull: true },
    billing_district: { type: DataTypes.STRING(100), allowNull: true },
    billing_state: { type: DataTypes.STRING(100), allowNull: true },
    billing_pincode: { type: DataTypes.STRING(20), allowNull: true },
    billing_landmark: { type: DataTypes.STRING(255), allowNull: true },
    billing_country: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: "India",
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "b2b_clients",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = B2BClient;
