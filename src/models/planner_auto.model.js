"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const PlannerAuto = sequelize.define(
  "PlannerAuto",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    task_category_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "task_planner_categories", key: "id" },
    },
    task_key: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    details: { type: DataTypes.STRING, allowNull: false },
    task_priority_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "task_priorities", key: "id" },
    },
    task_complete_days: { type: DataTypes.INTEGER, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "planner_autos",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = PlannerAuto;


