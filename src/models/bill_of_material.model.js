"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const BillOfMaterial = sequelize.define(
  "BillOfMaterial",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    bom_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bom_name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: "BOM name is required",
        },
      },
    },
    bom_description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    bom_detail: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      validate: {
        isArray(value) {
          if (!Array.isArray(value)) {
            throw new Error("bom_detail must be an array");
          }
        },
        minLength(value) {
          if (!Array.isArray(value) || value.length === 0) {
            throw new Error("At least one bom_detail is required");
          }
        },
        isValidDetail(value) {
          if (Array.isArray(value)) {
            value.forEach((detail, index) => {
              if (!detail.product_id || typeof detail.product_id !== "number") {
                throw new Error(`bom_detail[${index}].product_id must be a number`);
              }
              if (detail.quantity === undefined) {
                throw new Error(`bom_detail[${index}].quantity Required`);
              }
              if (detail.description !== undefined && detail.description !== null && typeof detail.description !== "string") {
                throw new Error(`bom_detail[${index}].description must be a string`);
              }
            });
          }
        },
      },
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
    tableName: "bill_of_materials",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = BillOfMaterial;

