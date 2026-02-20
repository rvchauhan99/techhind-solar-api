"use strict";

/**
 * Normalize user emails to lowercase and enforce case-insensitive uniqueness.
 * 1. Normalize existing emails to LOWER(TRIM(email))
 * 2. Resolve duplicates: keep one user per email (smallest id), soft-delete the rest
 * 3. Add unique partial index on LOWER(email) for non-deleted users
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    // 1. For non-deleted users, keep one row per LOWER(email) (smallest id), soft-delete the rest.
    //    Must run before normalizing emails so we don't violate unique on email when two rows become same string.
    await sequelize.query(`
      WITH kept AS (
        SELECT MIN(id) AS id
        FROM users
        WHERE deleted_at IS NULL
        GROUP BY LOWER(TRIM(email))
      )
      UPDATE users
      SET deleted_at = NOW()
      WHERE deleted_at IS NULL
        AND id NOT IN (SELECT id FROM kept);
    `);

    // 2. Normalize emails to lowercase only for non-deleted users (avoid duplicate key with soft-deleted rows)
    await sequelize.query(`
      UPDATE users
      SET email = LOWER(TRIM(email))
      WHERE deleted_at IS NULL AND email IS NOT NULL AND (email != LOWER(TRIM(email)));
    `);

    // 3. Case-insensitive uniqueness for non-deleted users (defense in depth)
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
      ON users (LOWER(email))
      WHERE deleted_at IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS idx_users_email_lower;"
    );
    // Data changes (normalized emails, soft-deleted duplicates) are not reverted.
  },
};
