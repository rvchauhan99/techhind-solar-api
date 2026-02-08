"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const ProjectPrice = sequelize.define(
  "ProjectPrice",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    state_id: { type: DataTypes.INTEGER, allowNull: false },
    project_for_id: { type: DataTypes.INTEGER, allowNull: false },
    order_type_id: { type: DataTypes.INTEGER, allowNull: false },
    bill_of_material_id: { type: DataTypes.INTEGER, allowNull: true },
    project_capacity: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    price_per_kwa: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    total_project_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    state_subsidy: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    structure_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    netmeter_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    subsidy_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    system_warranty: { type: DataTypes.STRING, allowNull: true },
    is_locked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "project_prices",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = ProjectPrice;
