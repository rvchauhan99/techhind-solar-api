"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const InquiryDocument = sequelize.define(
  "InquiryDocument",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    inquiry_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "inquiries", key: "id" },
    },
    doc_type: { type: DataTypes.STRING, allowNull: false },
    document_path: { type: DataTypes.STRING, allowNull: false },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "inquiry_documents",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = InquiryDocument;

