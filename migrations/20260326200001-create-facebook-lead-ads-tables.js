"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ── 1. facebook_accounts ─────────────────────────────────────────────────
    await queryInterface.createTable("facebook_accounts", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      fb_user_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      display_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      short_access_token: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      access_token: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex("facebook_accounts", ["user_id"]);
    await queryInterface.addIndex("facebook_accounts", ["fb_user_id"]);
    await queryInterface.addIndex("facebook_accounts", ["is_active"]);

    // ── 2. facebook_pages ─────────────────────────────────────────────────────
    await queryInterface.createTable("facebook_pages", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      account_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "facebook_accounts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      page_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      page_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      page_access_token: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      is_subscribed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex("facebook_pages", ["account_id"]);
    await queryInterface.addIndex("facebook_pages", ["page_id"]);
    await queryInterface.addIndex("facebook_pages", ["is_subscribed"]);

    // ── 3. facebook_lead_forms ────────────────────────────────────────────────
    await queryInterface.createTable("facebook_lead_forms", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      page_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: "facebook_pages", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      form_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      form_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      form_status: {
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

    await queryInterface.addIndex("facebook_lead_forms", ["page_id"]);
    await queryInterface.addIndex("facebook_lead_forms", ["form_id"]);

    // ── 4. Seed Facebook inquiry_source (if missing) ──────────────────────────
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM inquiry_sources WHERE source_name ILIKE 'Facebook' AND deleted_at IS NULL LIMIT 1`
    );
    if (!existing || existing.length === 0) {
      await queryInterface.bulkInsert("inquiry_sources", [
        {
          source_name: "Facebook",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("facebook_lead_forms");
    await queryInterface.dropTable("facebook_pages");
    await queryInterface.dropTable("facebook_accounts");
    // Note: We do NOT remove the Facebook inquiry_source seed on rollback.
  },
};
