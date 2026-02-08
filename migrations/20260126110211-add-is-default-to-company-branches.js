"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add is_default column
    await queryInterface.addColumn("company_branches", "is_default", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Set the first branch (by created_at) as default for each company
    // This handles existing data
    await queryInterface.sequelize.query(`
      UPDATE company_branches cb1
      SET is_default = true
      WHERE cb1.id = (
        SELECT cb2.id
        FROM company_branches cb2
        WHERE cb2.company_id = cb1.company_id
          AND cb2.deleted_at IS NULL
        ORDER BY cb2.created_at ASC
        LIMIT 1
      )
        AND cb1.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM company_branches cb3
          WHERE cb3.company_id = cb1.company_id
            AND cb3.is_default = true
            AND cb3.deleted_at IS NULL
        );
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("company_branches", "is_default");
  },
};
