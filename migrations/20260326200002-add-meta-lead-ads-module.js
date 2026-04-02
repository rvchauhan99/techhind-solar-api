"use strict";

/**
 * Adds the Meta Lead Ads Setup module (route /meta-setup) to the modules table.
 * Assigned to the same parent area as Marketing Leads.
 * After running, go to Role → Module to grant access.
 */
module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM modules WHERE key = 'meta_lead_ads' AND deleted_at IS NULL LIMIT 1`
    );
    if (existing && existing.length > 0) return;

    // Get the Marketing Leads module's sequence to place Meta just after it
    const [mlRows] = await queryInterface.sequelize.query(
      `SELECT sequence FROM modules WHERE key = 'marketing_leads' AND deleted_at IS NULL LIMIT 1`
    );
    const mlSeq = mlRows?.[0]?.sequence ?? 100;

    await queryInterface.sequelize.query(`
      INSERT INTO modules (name, key, parent_id, icon, route, sequence, status, created_at, updated_at)
      VALUES (
        'Meta Lead Ads',
        'meta_lead_ads',
        NULL,
        'brand-facebook',
        '/meta-setup',
        ${mlSeq + 1},
        'active',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE modules SET deleted_at = CURRENT_TIMESTAMP WHERE key = 'meta_lead_ads'`
    );
  },
};
