"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");
const { USER_STATUS } = require("../common/utils/constants.js");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true, // because Google login may not have password
    },
    google_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    photo: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    brith_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    blood_group: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    mobile_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    manager_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    first_login: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    two_factor_secret: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    two_factor_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: USER_STATUS.ACTIVE,
      validate: {
        isIn: [Object.values(USER_STATUS)],
      },
    },
    last_login: {
      type: DataTypes.DATE,
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
    tableName: "users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true, // enables soft delete using deleted_at
    deletedAt: "deleted_at",
  }
);

module.exports = User;
