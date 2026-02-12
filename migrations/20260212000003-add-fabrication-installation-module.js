"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        const [existing] = await queryInterface.sequelize.query(
            `SELECT id FROM modules WHERE key = 'fabrication_installation' AND deleted_at IS NULL LIMIT 1`
        );
        if (existing && existing.length > 0) return;

        await queryInterface.sequelize.query(`
            INSERT INTO modules (name, key, parent_id, icon, route, sequence, status, created_at, updated_at)
            VALUES (
                'Fabrication & Installation',
                'fabrication_installation',
                NULL,
                'build',
                '/fabrication-installation',
                50,
                'active',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
        `);
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(
            `UPDATE modules SET deleted_at = CURRENT_TIMESTAMP WHERE key = 'fabrication_installation'`
        );
    },
};
