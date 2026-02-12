"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const Installation = sequelize.define(
    "Installation",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        order_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            unique: true,
        },
        installer_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        installation_start_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        installation_end_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        inverter_installation_location: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        earthing_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        wiring_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        acdb_dcdb_make: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        panel_mounting_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        netmeter_readiness_status: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        total_panels_installed: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        inverter_serial_no: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        panel_serial_numbers: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        earthing_resistance: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        initial_generation: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        checklist: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        images: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        completed_at: {
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
        tableName: "installations",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
);

module.exports = Installation;
