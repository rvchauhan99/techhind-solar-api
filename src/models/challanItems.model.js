"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const ChallanItems = sequelize.define(
    "ChallanItems",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        challan_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        product_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        quantity: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },

        serials: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        remarks: {
            type: DataTypes.TEXT,
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
        tableName: "challan_items",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
);

module.exports = ChallanItems;
