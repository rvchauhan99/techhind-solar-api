"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const Notification = sequelize.define(
    "Notification",
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        user_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(80),
            allowNull: false,
        },
        module: {
            type: DataTypes.STRING(40),
            allowNull: false,
        },
        title: {
            type: DataTypes.STRING(200),
            allowNull: false,
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        reference_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        reference_number: {
            type: DataTypes.STRING(60),
            allowNull: true,
        },
        redirect_url: {
            type: DataTypes.STRING(300),
            allowNull: true,
        },
        action_label: {
            type: DataTypes.STRING(80),
            allowNull: true,
            defaultValue: "View",
        },
        is_read: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
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
        tableName: "notifications",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
);

module.exports = Notification;
