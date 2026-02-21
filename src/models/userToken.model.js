"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const UserToken = sequelize.define(
  "UserToken",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    access_token: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    refresh_token: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    refresh_iat: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    refresh_exp: {
      type: DataTypes.DATE,
      allowNull: false,
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
    tableName: "user_tokens",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    // paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = UserToken;
