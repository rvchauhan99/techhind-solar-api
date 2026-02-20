"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const B2BShipmentItem = sequelize.define(
  "B2BShipmentItem",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    b2b_shipment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "b2b_shipments", key: "id" },
    },
    b2b_sales_order_item_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "b2b_sales_order_items", key: "id" },
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "products", key: "id" },
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    serials: { type: DataTypes.TEXT, allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "b2b_shipment_items",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = B2BShipmentItem;
