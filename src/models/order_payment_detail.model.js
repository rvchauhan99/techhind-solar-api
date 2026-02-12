"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const OrderPaymentDetail = sequelize.define(
    "OrderPaymentDetail",
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        order_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: {
                model: "orders",
                key: "id",
            },
        },
        date_of_payment: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        payment_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        payment_mode_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: {
                model: "payment_modes",
                key: "id",
            },
        },
        transaction_cheque_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        transaction_cheque_number: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        bank_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
            references: {
                model: "banks",
                key: "id",
            },
        },
        company_bank_account_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: {
                model: "company_bank_accounts",
                key: "id",
            },
        },
        receipt_cheque_file: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        payment_remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM("pending_approval", "approved", "rejected"),
            allowNull: false,
            defaultValue: "pending_approval",
        },
        approved_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        approved_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        rejected_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        rejected_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        rejection_reason: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        receipt_number: {
            type: DataTypes.STRING(50),
            allowNull: true,
            unique: true,
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
        tableName: "order_payment_details",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
);

module.exports = OrderPaymentDetail;
