"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const ChallanItemSerial = sequelize.define(
    "ChallanItemSerial",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        challan_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: { model: "challans", key: "id" },
        },
        challan_item_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: { model: "challan_items", key: "id" },
        },
        order_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: { model: "orders", key: "id" },
        },
        product_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: { model: "products", key: "id" },
        },
        serial_number: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        stock_serial_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
            references: { model: "stock_serials", key: "id" },
        },
        source: {
            type: DataTypes.ENUM("delivery_scan", "installation_force_adjust"),
            allowNull: false,
            defaultValue: "delivery_scan",
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
    },
    {
        tableName: "challan_item_serials",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
        indexes: [
            {
                unique: true,
                fields: ["challan_item_id", "serial_number"],
                where: { deleted_at: null, is_active: true },
            },
        ],
    }
);

module.exports = ChallanItemSerial;
