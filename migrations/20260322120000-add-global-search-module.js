"use strict";

/**
 * Adds the Global Search module (route /search).
 * Assign read access via Role → Module mapping for roles that should see the menu.
 */
module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM modules WHERE key = 'global_search' AND deleted_at IS NULL LIMIT 1`
    );
    if (existing && existing.length > 0) return;

    await queryInterface.sequelize.query(`
      INSERT INTO modules (name, key, parent_id, icon, route, sequence, status, created_at, updated_at)
      VALUES (
        'Global Search',
        'global_search',
        NULL,
        'search',
        '/search',
        12,
        'active',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE modules SET deleted_at = CURRENT_TIMESTAMP WHERE key = 'global_search'`
    );
  },
};
