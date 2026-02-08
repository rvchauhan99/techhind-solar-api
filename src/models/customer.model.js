"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const Customer = sequelize.define(
  "Customer",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    customer_name: { type: DataTypes.STRING },
    mobile_number: { type: DataTypes.STRING },
    company_name: { type: DataTypes.STRING },
    phone_no: { type: DataTypes.STRING },
    email_id: { type: DataTypes.STRING },
    pin_code: { type: DataTypes.STRING },
    state_id: { type: DataTypes.BIGINT },
    city_id: { type: DataTypes.BIGINT },
    address: { type: DataTypes.TEXT },
    landmark_area: { type: DataTypes.STRING },
    taluka: { type: DataTypes.STRING },
    district: { type: DataTypes.STRING },

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
    tableName: "customers",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = Customer;
