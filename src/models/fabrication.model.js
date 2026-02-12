"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const Fabrication = sequelize.define(
    "Fabrication",
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
        fabricator_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        fabrication_start_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        fabrication_end_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        structure_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        structure_material: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        coating_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        tilt_angle: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        height_from_roof: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        labour_category: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        labour_count: {
            type: DataTypes.INTEGER,
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
        tableName: "fabrications",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
);

module.exports = Fabrication;
