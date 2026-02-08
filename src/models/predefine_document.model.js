"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const PredefineDocument = sequelize.define(
  "PredefineDocument",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    page_name: { type: DataTypes.STRING, allowNull: false },
    page_url: { type: DataTypes.STRING, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "predefine_documents",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = PredefineDocument;


