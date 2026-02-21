"use strict";

const { DataTypes, QueryTypes } = require("sequelize");
const sequelize = require("../config/db.js");
const { TRANSFER_STATUS } = require("../common/utils/constants.js");

// Helper to generate transfer number: YYMM### (uses tenant-bound sequelize when available)
const generateTransferNumber = async (seq) => {
  const db = seq || sequelize;
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const yymm = `${year}${month}`;

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const results = await db.query(
    `SELECT COUNT(*) as count 
     FROM stock_transfers 
     WHERE created_at >= :startOfMonth 
       AND created_at <= :endOfMonth 
       AND deleted_at IS NULL`,
    {
      replacements: {
        startOfMonth: startOfMonth.toISOString(),
        endOfMonth: endOfMonth.toISOString(),
      },
      type: db.QueryTypes.SELECT,
    }
  );

  const count = parseInt(results[0]?.count || results[0]?.COUNT || 0) || 0;
  const minRange = (count + 1) * 10;
  const maxRange = (count + 2) * 10 - 1;
  const randomNum = Math.floor(Math.random() * (maxRange - minRange + 1)) + minRange;

  return `TR${yymm}${randomNum}`;
};

const StockTransfer = sequelize.define(
  "StockTransfer",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    transfer_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
    },
    transfer_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    from_warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "company_warehouses", key: "id" },
    },
    to_warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "company_warehouses", key: "id" },
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: TRANSFER_STATUS.DRAFT,
      validate: {
        isIn: [Object.values(TRANSFER_STATUS)],
      },
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    requested_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    approved_at: {
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
    tableName: "stock_transfers",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

StockTransfer.beforeCreate(async (transfer, options) => {
  if (!transfer.transfer_number) {
    const seq = (options?.transaction?.sequelize) || transfer.sequelize;
    transfer.transfer_number = await generateTransferNumber(seq);
  }
});

module.exports = StockTransfer;

