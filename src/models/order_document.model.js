"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const OrderDocument = sequelize.define(
    "OrderDocument",
    {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        order_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: { model: "orders", key: "id" },
        },
        doc_type: { type: DataTypes.STRING, allowNull: false },
        document_path: { type: DataTypes.STRING, allowNull: false },
        remarks: { type: DataTypes.TEXT, allowNull: true },
        created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
        tableName: "order_documents",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
);

module.exports = OrderDocument;
