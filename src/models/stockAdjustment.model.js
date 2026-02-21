"use strict";

const { DataTypes, QueryTypes } = require("sequelize");
const sequelize = require("../config/db.js");
const { ADJUSTMENT_STATUS, ADJUSTMENT_TYPE } = require("../common/utils/constants.js");

// Helper to generate adjustment number: YYMM### (uses tenant-bound sequelize when available)
const generateAdjustmentNumber = async (seq) => {
  const db = seq || sequelize;
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const yymm = `${year}${month}`;

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const results = await db.query(
    `SELECT COUNT(*) as count 
     FROM stock_adjustments 
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

  return `ADJ${yymm}${randomNum}`;
};

const StockAdjustment = sequelize.define(
  "StockAdjustment",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    adjustment_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
    },
    adjustment_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    warehouse_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "company_warehouses", key: "id" },
    },
    adjustment_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [Object.values(ADJUSTMENT_TYPE)],
      },
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: ADJUSTMENT_STATUS.DRAFT,
      validate: {
        isIn: [Object.values(ADJUSTMENT_STATUS)],
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
    tableName: "stock_adjustments",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

StockAdjustment.beforeCreate(async (adjustment, options) => {
  if (!adjustment.adjustment_number) {
    const seq = (options?.transaction?.sequelize) || adjustment.sequelize;
    adjustment.adjustment_number = await generateAdjustmentNumber(seq);
  }
});

module.exports = StockAdjustment;

