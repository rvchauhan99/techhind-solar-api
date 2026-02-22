"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const POInwardSerial = sequelize.define(
  "POInwardSerial",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    po_inward_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "po_inward_items", key: "id" },
    },
    product_type_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "product_types", key: "id" },
    },
    serial_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "RECEIVED",
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "po_inward_serials",
    timestamps: false,
  }
);

module.exports = POInwardSerial;

