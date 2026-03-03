"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const QuotationTemplateConfig = sequelize.define(
    "QuotationTemplateConfig",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        quotation_template_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: "quotation_templates", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
        },
        default_background_image_path: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        default_footer_image_path: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        page_backgrounds: {
            type: DataTypes.JSON,
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
    },
    {
        tableName: "quotation_template_configs",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    }
);

module.exports = QuotationTemplateConfig;
