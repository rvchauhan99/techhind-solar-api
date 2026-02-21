"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");
const { INQUIRY_STATUS } = require("../common/utils/constants.js");

// Helper to generate inquiry number: YYMM### (uses tenant-bound sequelize when available)
const generateInquiryNumber = async (seq) => {
  const db = seq || sequelize;
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const yymm = `${year}${month}`;

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const results = await db.query(
    `SELECT COUNT(*) as count 
     FROM inquiries 
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

  // Calculate random range based on inquiry count
  // 1st inquiry (count = 0): 10-20
  // 2nd inquiry (count = 1): 20-30
  // 3rd inquiry (count = 2): 30-40
  // etc.
  const minRange = (count + 1) * 10;
  const maxRange = (count + 2) * 10 - 1;

  // Generate random number in the range
  const randomNum = Math.floor(Math.random() * (maxRange - minRange + 1)) + minRange;

  // Format as 3 digits
  // const lastThree = String(randomNum).padStart(3, "0");

  // return `${yymm}${lastThree}`;
  return `${yymm}${randomNum}`;
};

const Inquiry = sequelize.define(
  "Inquiry",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    inquiry_number: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },

    // Reference fields (FKs)
    inquiry_source_id: { type: DataTypes.BIGINT },
    customer_id: { type: DataTypes.BIGINT },
    date_of_inquiry: { type: DataTypes.DATEONLY },
    inquiry_by: { type: DataTypes.BIGINT },
    handled_by: { type: DataTypes.BIGINT },
    channel_partner: { type: DataTypes.BIGINT }, // FK → users.id (channel partner user)
    branch_id: { type: DataTypes.BIGINT },
    project_scheme_id: { type: DataTypes.BIGINT },
    capacity: { type: DataTypes.FLOAT, defaultValue: 0 },
    order_type: { type: DataTypes.BIGINT },
    discom_id: { type: DataTypes.BIGINT },
    rating: { type: DataTypes.STRING },
    remarks: { type: DataTypes.TEXT },
    next_reminder_date: { type: DataTypes.DATEONLY },
    reference_from: { type: DataTypes.STRING },
    estimated_cost: { type: DataTypes.FLOAT },
    payment_type: { type: DataTypes.STRING },
    do_not_send_message: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_dead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: INQUIRY_STATUS.NEW,
      validate: {
        isIn: [Object.values(INQUIRY_STATUS)],
      },
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
    tableName: "inquiries",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

Inquiry.beforeCreate(async (inquiry, options) => {
  if (!inquiry.inquiry_number) {
    const seq = (options?.transaction?.sequelize) || inquiry.sequelize;
    inquiry.inquiry_number = await generateInquiryNumber(seq);
  }
});

module.exports = Inquiry;
