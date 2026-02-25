"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1) marketing_leads
    await queryInterface.createTable("marketing_leads", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      // Identity
      lead_number: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },

      // Basic lead/contact info
      customer_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      mobile_number: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      alternate_mobile_number: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      phone_no: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      email_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      company_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      landmark_area: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      city_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: "cities", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      state_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: "states", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      pin_code: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      district: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      taluka: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      // Classification
      branch_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: "company_branches", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      inquiry_source_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: "inquiry_sources", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      campaign_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      lead_segment: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      product_interest: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      expected_capacity_kw: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      expected_project_cost: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },

      // Ownership
      assigned_to: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      // Lifecycle & status
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "new",
      },
      status_reason: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      last_call_outcome: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      last_called_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      next_follow_up_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      priority: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "medium",
      },
      lead_score: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      converted_inquiry_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: "inquiries", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      converted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      // Notes & tags
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      tags: {
        type: Sequelize.JSON,
        allowNull: true,
      },

      // Deduplication
      duplicate_group_key: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      is_primary_in_duplicate_group: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex("marketing_leads", ["mobile_number"]);
    await queryInterface.addIndex("marketing_leads", ["assigned_to"]);
    await queryInterface.addIndex("marketing_leads", ["status"]);
    await queryInterface.addIndex("marketing_leads", ["branch_id"]);
    await queryInterface.addIndex("marketing_leads", ["next_follow_up_at"]);

    // 2) marketing_lead_follow_ups
    await queryInterface.createTable("marketing_lead_follow_ups", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      lead_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "marketing_leads", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      contacted_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      contact_channel: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      call_duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      outcome: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      outcome_sub_status: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      next_follow_up_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      promised_action: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      recording_url: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex("marketing_lead_follow_ups", ["lead_id"]);
    await queryInterface.addIndex("marketing_lead_follow_ups", ["contacted_at"]);
    await queryInterface.addIndex("marketing_lead_follow_ups", ["created_by"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("marketing_lead_follow_ups");
    await queryInterface.dropTable("marketing_leads");
  },
};

