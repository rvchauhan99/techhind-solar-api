"use strict";

/**
 * Backfill orders.channel_partner_id from the linked inquiry's channel_partner
 * for orders that have inquiry_id set but channel_partner_id is null.
 * Only updates where the inquiry has a non-null channel_partner.
 */
module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(`
            UPDATE orders o
            SET channel_partner_id = i.channel_partner,
                updated_at = NOW()
            FROM inquiries i
            WHERE o.inquiry_id = i.id
              AND o.channel_partner_id IS NULL
              AND i.channel_partner IS NOT NULL
              AND o.deleted_at IS NULL
              AND i.deleted_at IS NULL
        `);
    },

    async down() {
        // Data backfill: cannot reliably revert which rows were updated.
        // Leave channel_partner_id as-is on rollback.
    },
};
