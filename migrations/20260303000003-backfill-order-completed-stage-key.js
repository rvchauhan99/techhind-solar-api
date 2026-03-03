"use strict";

/**
 * Backfill current_stage_key to 'order_completed' for all orders with status 'completed'
 * so that list views and pipeline UI show "Completed" instead of "Current" on the last stage.
 */
module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(`
            UPDATE orders
            SET current_stage_key = 'order_completed', updated_at = NOW()
            WHERE status = 'completed'
              AND deleted_at IS NULL
              AND (current_stage_key IS NULL OR current_stage_key != 'order_completed')
        `);
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(`
            UPDATE orders
            SET current_stage_key = 'subsidy_disbursed', updated_at = NOW()
            WHERE status = 'completed' AND current_stage_key = 'order_completed' AND deleted_at IS NULL
        `);
    },
};
