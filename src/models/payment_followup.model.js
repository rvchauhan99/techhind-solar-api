"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const PaymentFollowUp = sequelize.define(
  "PaymentFollowUp",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    order_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "orders",
        key: "id",
      },
    },
    contacted_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    contact_channel: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    outcome: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    outcome_sub_status: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    next_follow_up_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    promised_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    promised_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: "payment_followups",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = PaymentFollowUp;

