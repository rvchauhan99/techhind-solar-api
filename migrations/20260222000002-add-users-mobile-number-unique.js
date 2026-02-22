"use strict";

/**
 * Add unique constraint on users.mobile_number (for non-deleted, non-null values).
 * 1. Resolve duplicates: keep one user per mobile (smallest id), null out the rest
 * 2. Add partial unique index on mobile_number
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    // 1. For non-deleted users with non-null mobile_number, keep one row per mobile (smallest id), null out the rest
    await sequelize.query(`
      WITH kept AS (
        SELECT MIN(id) AS id
        FROM users
        WHERE deleted_at IS NULL AND mobile_number IS NOT NULL AND TRIM(mobile_number) != ''
        GROUP BY TRIM(mobile_number)
      )
      UPDATE users
      SET mobile_number = NULL
      WHERE deleted_at IS NULL
        AND mobile_number IS NOT NULL
        AND TRIM(mobile_number) != ''
        AND id NOT IN (SELECT id FROM kept);
    `);

    // 2. Add partial unique index for non-null mobile_number among non-deleted users
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mobile_number_unique
      ON users (TRIM(mobile_number))
      WHERE deleted_at IS NULL AND mobile_number IS NOT NULL AND TRIM(mobile_number) != '';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS idx_users_mobile_number_unique;"
    );
    // Duplicate resolution (nulled mobile_numbers) is not reverted.
  },
};
