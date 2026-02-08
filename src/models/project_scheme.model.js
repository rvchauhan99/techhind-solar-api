"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const ProjectScheme = sequelize.define(
  "ProjectScheme",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    subsidy_scheme: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    allow_inquiry: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    allow_order: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "project_schemes",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = ProjectScheme;


