"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const FacebookPage = sequelize.define(
  "FacebookPage",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    // Which FacebookAccount this page belongs to
    account_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },

    // Facebook Page ID (e.g. "123456789")
    page_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Human-readable page name
    page_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Page-level access token (different from user token)
    page_access_token: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    // Whether the platform has subscribed to leadgen webhooks for this page
    is_subscribed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    tableName: "facebook_pages",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = FacebookPage;
