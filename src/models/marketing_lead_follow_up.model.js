"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const MarketingLeadFollowUp = sequelize.define(
  "MarketingLeadFollowUp",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    lead_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },

    contacted_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    contact_channel: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    call_duration_seconds: {
      type: DataTypes.INTEGER,
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
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    next_follow_up_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    promised_action: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    recording_url: {
      type: DataTypes.STRING,
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
    tableName: "marketing_lead_follow_ups",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = MarketingLeadFollowUp;

