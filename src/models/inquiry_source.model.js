"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const InquirySource = sequelize.define(
  "InquirySource",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    source_name: { type: DataTypes.STRING, allowNull: false },
    icon: { type: DataTypes.STRING, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "inquiry_sources",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = InquirySource;


