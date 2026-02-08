"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // First, set all states to is_default = false
    await queryInterface.sequelize.query(`
      UPDATE states
      SET is_default = false
      WHERE deleted_at IS NULL;
    `);

    // Set the first state (by created_at) as default for existing data
    await queryInterface.sequelize.query(`
      UPDATE states s1
      SET is_default = true
      WHERE s1.id = (
        SELECT s2.id
        FROM states s2
        WHERE s2.deleted_at IS NULL
        ORDER BY s2.created_at ASC
        LIMIT 1
      )
        AND s1.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM states s3
          WHERE s3.is_default = true
            AND s3.deleted_at IS NULL
        );
    `);

    // Change the default value of the column
    await queryInterface.changeColumn("states", "is_default", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    // Revert to previous default value (true)
    await queryInterface.changeColumn("states", "is_default", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },
};
