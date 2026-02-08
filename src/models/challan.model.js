"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const Challan = sequelize.define(
    "Challan",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        challan_no: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        challan_date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },

        transporter: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        transporter_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },

        order_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        warehouse_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
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
        tableName: "challans",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
);

module.exports = Challan;
