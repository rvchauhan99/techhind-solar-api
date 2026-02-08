"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const LoanType = sequelize.define(
  "LoanType",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    type_name: { type: DataTypes.STRING, allowNull: false },
    interest_rate: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    logo: { type: DataTypes.STRING, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "loan_types",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = LoanType;


