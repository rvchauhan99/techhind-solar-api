"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const BillOfMaterial = sequelize.define(
  "BillOfMaterial",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    bom_code: { type: DataTypes.STRING, allowNull: true },
    bom_name: { type: DataTypes.STRING, allowNull: false },
    bom_description: { type: DataTypes.TEXT, allowNull: true },
    bom_detail: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: "Array of objects: [{product_id, quantity}]",
      validate: {
        isValidDetail(value) {
          if (!Array.isArray(value)) {
            throw new Error("bom_detail must be an array");
          }
          if (value.length === 0) {
            throw new Error("At least one BOM detail is required");
          }
          value.forEach((detail, index) => {
            if (!detail.product_id || typeof detail.product_id !== "number") {
              throw new Error(`bom_detail[${index}].product_id must be a number`);
            }
            if (!detail.quantity || typeof detail.quantity !== "number") {
              throw new Error(`bom_detail[${index}].quantity must be a number`);
            }
            if (detail.quantity <= 0) {
              throw new Error(`bom_detail[${index}].quantity must be greater than 0`);
            }
          });
        },
      },
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "bill_of_materials",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = BillOfMaterial;

