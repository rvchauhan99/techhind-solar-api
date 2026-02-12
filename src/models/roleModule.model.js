"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const RoleModule = sequelize.define(
  "RoleModule",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    module_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    can_create: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    can_read: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    can_update: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    can_delete: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    listing_criteria: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "all",
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
    tableName: "role_modules",
    timestamps: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  }
);

module.exports = RoleModule;
