"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const FacebookAccount = sequelize.define(
  "FacebookAccount",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    // The platform user who connected this Facebook account
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },

    // Facebook user ID returned from /me
    fb_user_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Facebook display name for this account
    display_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Short-lived token received directly from OAuth code exchange
    short_access_token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Long-lived (60-day) access token after exchange
    access_token: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    // When the long-lived token expires
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Whether this account link is active
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
    tableName: "facebook_accounts",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = FacebookAccount;
