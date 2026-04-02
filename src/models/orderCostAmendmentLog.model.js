"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const OrderCostAmendmentLog = sequelize.define(
  "OrderCostAmendmentLog",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    order_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    product_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    actor_user_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    change_type: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    qty_delta: {
      type: DataTypes.DECIMAL(12, 3),
      allowNull: true,
    },
    unit_price_base: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    gst_mode: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    gst_rate: {
      type: DataTypes.DECIMAL(6, 3),
      allowNull: true,
    },
    line_amount_excluding_gst: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    line_amount_including_gst: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    project_cost_before: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    project_cost_after: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    final_payable_before: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    final_payable_after: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: "order_cost_amendment_logs",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = OrderCostAmendmentLog;
