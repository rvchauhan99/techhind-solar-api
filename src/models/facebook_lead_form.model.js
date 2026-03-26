"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const FacebookLeadForm = sequelize.define(
  "FacebookLeadForm",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    // Which FacebookPage this form belongs to
    page_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },

    // Facebook Lead Form ID
    form_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Human-readable form name
    form_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Status of this form on Facebook (active, archived, with_issues)
    form_status: {
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
    tableName: "facebook_lead_forms",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = FacebookLeadForm;
