"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const CompanyBankAccount = sequelize.define(
  "CompanyBankAccount",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bank_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    bank_account_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    bank_account_number: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    bank_account_ifsc: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bank_account_branch: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    tableName: "company_bank_accounts",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = CompanyBankAccount;

