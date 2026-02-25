"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

// Helper to generate lead number: ML-YYMM###
const generateLeadNumber = async (seq) => {
  const db = seq || sequelize;
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const yymm = `${year}${month}`;

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  const results = await db.query(
    `SELECT COUNT(*) as count
     FROM marketing_leads
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

  const count = parseInt(results[0]?.count || results[0]?.COUNT || 0, 10) || 0;

  // Similar strategy to inquiries/orders: sliding 10-number window
  const minRange = (count + 1) * 10;
  const maxRange = (count + 2) * 10 - 1;
  const randomNum =
    Math.floor(Math.random() * (maxRange - minRange + 1)) + minRange;

  return `ML-${yymm}${randomNum}`;
};

const MarketingLead = sequelize.define(
  "MarketingLead",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    lead_number: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },

    // Basic lead/contact info
    customer_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mobile_number: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    alternate_mobile_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone_no: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    company_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    landmark_area: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    city_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    state_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    pin_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    district: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    taluka: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Classification
    branch_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    inquiry_source_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    campaign_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lead_segment: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    product_interest: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expected_capacity_kw: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    expected_project_cost: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    // Ownership
    assigned_to: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },

    // Lifecycle & status
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "new",
    },
    status_reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_call_outcome: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_called_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    next_follow_up_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    priority: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "medium",
    },
    lead_score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    converted_inquiry_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    converted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Notes & tags
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    // Deduplication
    duplicate_group_key: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_primary_in_duplicate_group: {
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
    tableName: "marketing_leads",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

MarketingLead.beforeCreate(async (lead, options) => {
  if (!lead.lead_number) {
    const seq = options?.transaction?.sequelize || lead.sequelize;
    lead.lead_number = await generateLeadNumber(seq);
  }
});

module.exports = MarketingLead;

