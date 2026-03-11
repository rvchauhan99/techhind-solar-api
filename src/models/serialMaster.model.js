"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const SerialMaster = sequelize.define(
    "SerialMaster",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        code: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
        },
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
        tableName: "serial_masters",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
);

module.exports = SerialMaster;
