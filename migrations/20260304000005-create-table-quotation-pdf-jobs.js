"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("quotation_pdf_jobs", {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      tenant_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      quotation_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      version_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      artifact_key: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "pending", // pending | processing | completed | failed
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      max_attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 3,
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      next_retry_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      runner_id: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      payload: {
        type: Sequelize.JSONB,
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
    });

    await queryInterface.addIndex("quotation_pdf_jobs", ["status", "next_retry_at"], {
      name: "quotation_pdf_jobs_status_retry_idx",
    });
    await queryInterface.addIndex("quotation_pdf_jobs", ["quotation_id", "version_key"], {
      name: "quotation_pdf_jobs_quotation_version_idx",
    });
    await queryInterface.addIndex("quotation_pdf_jobs", ["artifact_key"], {
      name: "quotation_pdf_jobs_artifact_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("quotation_pdf_jobs");
  },
};

