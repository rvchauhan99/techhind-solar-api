"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");
const { FOLLOWUP_RATING } = require("../common/utils/constants.js");

const Followup = sequelize.define(
  "Followup",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    inquiry_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    inquiry_status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    next_reminder: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    call_by: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    is_schedule_site_visit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_msg_send_to_customer: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    rating: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [FOLLOWUP_RATING],
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
    tableName: "followups",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = Followup;

