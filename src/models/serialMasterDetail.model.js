"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const SerialMasterDetail = sequelize.define(
    "SerialMasterDetail",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        serial_master_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: "serial_masters",
                key: "id",
            },
        },
        sort_order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        type: {
            type: DataTypes.STRING(30),
            allowNull: false,
            validate: {
                isIn: [["FIXED", "DATE", "SERIAL", "FINANCIAL_YEAR", "SEQUENTIALCHARACTER"]],
            },
        },
        fixed_char: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        date_format: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        width: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        start_value: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        next_value: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 1,
        },
        reset_value: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        last_generated: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        reset_interval: {
            type: DataTypes.STRING(10),
            allowNull: true,
            validate: {
                isIn: [[null, "", "DAILY", "MONTHLY", "YEARLY"]],
            },
        },
        last_reset_at: {
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
        created_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        updated_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
    },
    {
        tableName: "serial_master_details",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    }
);

module.exports = SerialMasterDetail;
