"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const SiteSurvey = sequelize.define(
    "SiteSurvey",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        site_visit_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            unique: true,
        },
        survey_date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        surveyor_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        type_of_roof: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        height_of_structure: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        building_front_photo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        roof_front_left_photo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        roof_front_right_photo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        roof_rear_left_photo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        roof_rear_right_photo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        drawing_photo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        has_shadow_object: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
        shadow_object_photo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        bom_detail: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: [],
            validate: {
                isArray(value) {
                    if (value !== null && value !== undefined && !Array.isArray(value)) {
                        throw new Error("bom_detail must be an array");
                    }
                },
            },
        },
        status: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: "active",
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
        tableName: "site_surveys",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
);

module.exports = SiteSurvey;
