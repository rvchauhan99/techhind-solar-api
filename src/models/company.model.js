"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const Company = sequelize.define(
  "Company",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    // Basic Info
    company_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    company_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    logo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    header: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    footer: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stamp: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Owner Info
    owner_name: { type: DataTypes.STRING },
    owner_number: { type: DataTypes.STRING },
    owner_email: { type: DataTypes.STRING },

    // Registered Office
    address: { type: DataTypes.TEXT },
    city: { type: DataTypes.STRING },
    state: { type: DataTypes.STRING },
    contact_number: { type: DataTypes.STRING },
    company_email: { type: DataTypes.STRING },
    company_website: { type: DataTypes.STRING },

    // Plan Info
    user_limit_used: { type: DataTypes.INTEGER, defaultValue: 0 },
    user_limit_total: { type: DataTypes.INTEGER, defaultValue: 0 },
    plan_valid_till: { type: DataTypes.DATEONLY },
    sms_credit_used: { type: DataTypes.INTEGER, defaultValue: 0 },
    sms_credit_total: { type: DataTypes.INTEGER, defaultValue: 0 },

    // Status and timestamps
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "companies",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = Company;
