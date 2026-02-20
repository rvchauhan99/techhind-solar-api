"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const B2BInvoice = sequelize.define(
  "B2BInvoice",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    invoice_no: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    invoice_date: { type: DataTypes.DATEONLY, allowNull: false },
    b2b_shipment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: "b2b_shipments", key: "id" },
    },
    b2b_sales_order_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "b2b_sales_orders", key: "id" },
    },
    client_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "b2b_clients", key: "id" },
    },
    ship_to_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "b2b_client_ship_to_addresses", key: "id" },
    },
    billing_gstin: { type: DataTypes.STRING(20), allowNull: true },
    place_of_supply: { type: DataTypes.STRING(100), allowNull: true },
    gst_type: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    // Snapshot fields (to print invoice without joins)
    order_no: { type: DataTypes.STRING(50), allowNull: true },
    shipment_no: { type: DataTypes.STRING(50), allowNull: true },

    company_name: { type: DataTypes.STRING(255), allowNull: true },
    company_gstin: { type: DataTypes.STRING(20), allowNull: true },
    company_address: { type: DataTypes.TEXT, allowNull: true },
    company_city: { type: DataTypes.STRING(100), allowNull: true },
    company_state: { type: DataTypes.STRING(100), allowNull: true },
    company_pincode: { type: DataTypes.STRING(20), allowNull: true },
    company_phone: { type: DataTypes.STRING(50), allowNull: true },
    company_email: { type: DataTypes.STRING(150), allowNull: true },

    bill_to_name: { type: DataTypes.STRING(255), allowNull: true },
    bill_to_gstin: { type: DataTypes.STRING(20), allowNull: true },
    bill_to_pan: { type: DataTypes.STRING(20), allowNull: true },
    bill_to_address: { type: DataTypes.TEXT, allowNull: true },
    bill_to_city: { type: DataTypes.STRING(100), allowNull: true },
    bill_to_district: { type: DataTypes.STRING(100), allowNull: true },
    bill_to_state: { type: DataTypes.STRING(100), allowNull: true },
    bill_to_pincode: { type: DataTypes.STRING(20), allowNull: true },
    bill_to_country: { type: DataTypes.STRING(50), allowNull: true },

    ship_to_name: { type: DataTypes.STRING(255), allowNull: true },
    ship_to_address: { type: DataTypes.TEXT, allowNull: true },
    ship_to_city: { type: DataTypes.STRING(100), allowNull: true },
    ship_to_district: { type: DataTypes.STRING(100), allowNull: true },
    ship_to_state: { type: DataTypes.STRING(100), allowNull: true },
    ship_to_pincode: { type: DataTypes.STRING(20), allowNull: true },
    ship_to_country: { type: DataTypes.STRING(50), allowNull: true },
    taxable_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    total_gst_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    cgst_amount_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    sgst_amount_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    igst_amount_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    round_off: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    grand_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "POSTED",
    },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    cancelled_at: { type: DataTypes.DATE, allowNull: true },
    cancelled_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    cancel_reason: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "b2b_invoices",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = B2BInvoice;
