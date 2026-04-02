"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add columns to inquiries table
    await queryInterface.addColumn("inquiries", "dead_reason_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "reasons",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("inquiries", "dead_reason", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("inquiries", "dead_remarks", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // 2. Seed basic reasons for "inquiry_dead" if they don't exist
    // Note: Using a try-catch or checking for existence is safer in case they were already added
    const basicReasons = [
      "Price too high",
      "Already installed",
      "Not interested",
      "Wrong number",
      "Location issue",
      "Technical issue",
    ];

    for (const reason of basicReasons) {
      await queryInterface.sequelize.query(
        `INSERT INTO reasons (reason_type, reason, is_active, created_at, updated_at)
         SELECT 'inquiry_dead', :reason, true, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM reasons WHERE reason_type = 'inquiry_dead' AND reason = :reason
         )`,
        {
          replacements: { reason },
          type: Sequelize.QueryTypes.INSERT,
        }
      );
    }
  },

  down: async (queryInterface, Sequelize) => {
    // We don't necessarily want to delete reasons in down as they might be used by other records,
    // but for completeness of the migration:
    // await queryInterface.bulkDelete("reasons", { reason_type: "inquiry_dead" });

    await queryInterface.removeColumn("inquiries", "dead_remarks");
    await queryInterface.removeColumn("inquiries", "dead_reason");
    await queryInterface.removeColumn("inquiries", "dead_reason_id");
  },
};
