"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const SubDivision = sequelize.define(
  "SubDivision",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    division_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "divisions", key: "id" },
    },
    contact_person_name: { type: DataTypes.STRING, allowNull: true },
    mobile_number: { type: DataTypes.STRING, allowNull: true },
    email_id: { type: DataTypes.STRING, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "sub_divisions",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = SubDivision;


