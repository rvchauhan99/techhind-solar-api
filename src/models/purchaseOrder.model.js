"use strict";

const { DataTypes, QueryTypes } = require("sequelize");
const sequelize = require("../config/db.js");
const { PO_STATUS } = require("../common/utils/constants.js");

// Helper to generate PO number: YYMM###
const generatePONumber = async () => {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const yymm = `${year}${month}`;

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const results = await sequelize.query(
    `SELECT COUNT(*) as count 
     FROM purchase_orders 
     WHERE created_at >= :startOfMonth 
       AND created_at <= :endOfMonth 
       AND deleted_at IS NULL`,
    {
      replacements: {
        startOfMonth: startOfMonth.toISOString(),
        endOfMonth: endOfMonth.toISOString(),
      },
      type: QueryTypes.SELECT,
    }
  );

  const count = parseInt(results[0]?.count || results[0]?.COUNT || 0) || 0;
  const minRange = (count + 1) * 10;
  const maxRange = (count + 2) * 10 - 1;
  const randomNum = Math.floor(Math.random() * (maxRange - minRange + 1)) + minRange;

  return `${yymm}${randomNum}`;
};

const PurchaseOrder = sequelize.define(
  "PurchaseOrder",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    po_number: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    po_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "suppliers", key: "id" },
    },
    bill_to_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "companies", key: "id" },
    },
    ship_to_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "company_warehouses", key: "id" },
    },
    payment_terms: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    delivery_terms: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    dispatch_terms: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    jurisdiction: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    total_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    taxable_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    total_gst_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    grand_total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    amount_in_words: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attachments: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: "Array of attachment objects: [{path, url, filename, size, mime_type, uploaded_at}]",
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: PO_STATUS.DRAFT,
      validate: {
        isIn: [Object.values(PO_STATUS)],
      },
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
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
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
    tableName: "purchase_orders",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

PurchaseOrder.beforeCreate(async (po) => {
  if (!po.po_number) {
    po.po_number = await generatePONumber();
  }
});

module.exports = PurchaseOrder;

