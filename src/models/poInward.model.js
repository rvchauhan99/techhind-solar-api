"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");
const { RECEIPT_STATUS, RECEIPT_TYPE } = require("../common/utils/constants.js");

const POInward = sequelize.define(
  "POInward",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    purchase_order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "purchase_orders", key: "id" },
    },
    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "suppliers", key: "id" },
    },
    warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "company_warehouses", key: "id" },
    },
    supplier_invoice_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    supplier_invoice_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    receipt_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: RECEIPT_TYPE.PARTIAL,
      validate: {
        isIn: [Object.values(RECEIPT_TYPE)],
      },
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: RECEIPT_STATUS.DRAFT,
      validate: {
        isIn: [Object.values(RECEIPT_STATUS)],
      },
    },
    total_received_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_accepted_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_rejected_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    inspection_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    received_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    received_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "po_inwards",
    timestamps: false,
  }
);

module.exports = POInward;

