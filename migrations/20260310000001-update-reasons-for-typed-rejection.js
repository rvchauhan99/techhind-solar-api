"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── Check current column state to make migration idempotent ──
    const tableDesc = await queryInterface.describeTable("reasons");

    // Rename `name` -> `reason` only if `name` exists and `reason` does not
    if (tableDesc.name && !tableDesc.reason) {
      await queryInterface.renameColumn("reasons", "name", "reason");
    }

    // Add typed reason fields + audit fields (only if they don't already exist)
    if (!tableDesc.reason_type) {
      await queryInterface.addColumn("reasons", "reason_type", {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "general",
      });
    }

    if (!tableDesc.description) {
      await queryInterface.addColumn("reasons", "description", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!tableDesc.created_by) {
      await queryInterface.addColumn("reasons", "created_by", {
        type: Sequelize.BIGINT,
        allowNull: true,
      });
    }

    if (!tableDesc.updated_by) {
      await queryInterface.addColumn("reasons", "updated_by", {
        type: Sequelize.BIGINT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable("reasons");

    if (tableDesc.updated_by) {
      await queryInterface.removeColumn("reasons", "updated_by");
    }
    if (tableDesc.created_by) {
      await queryInterface.removeColumn("reasons", "created_by");
    }
    if (tableDesc.description) {
      await queryInterface.removeColumn("reasons", "description");
    }
    if (tableDesc.reason_type) {
      await queryInterface.removeColumn("reasons", "reason_type");
    }

    // Rename back only if `reason` exists and `name` does not
    const updatedDesc = await queryInterface.describeTable("reasons");
    if (updatedDesc.reason && !updatedDesc.name) {
      await queryInterface.renameColumn("reasons", "reason", "name");
    }
  },
};
