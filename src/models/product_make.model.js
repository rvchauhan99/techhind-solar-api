"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const ProductMake = sequelize.define(
  "ProductMake",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    product_type_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "product_types", key: "id" },
    },
    name: { type: DataTypes.STRING, allowNull: false },
    logo: { type: DataTypes.STRING, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "product_makes",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = ProductMake;


