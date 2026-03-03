"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        const [rows] = await queryInterface.sequelize.query(
            `SELECT id FROM quotation_templates WHERE template_key = 'default' AND deleted_at IS NULL LIMIT 1`
        );
        if (rows && rows.length > 0) {
            return;
        }
        await queryInterface.sequelize.query(
            `INSERT INTO quotation_templates (name, template_key, description, is_default, created_at, updated_at)
             VALUES ('Default', 'default', 'Default quotation PDF template', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        );
        const [inserted] = await queryInterface.sequelize.query(
            `SELECT id FROM quotation_templates WHERE template_key = 'default' AND deleted_at IS NULL LIMIT 1`
        );
        const templateId = inserted && inserted[0] && inserted[0].id;
        if (templateId) {
            await queryInterface.sequelize.query(
                `INSERT INTO quotation_template_configs (quotation_template_id, created_at, updated_at)
                 VALUES (${templateId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
            );
        }
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(
            `DELETE FROM quotation_template_configs WHERE quotation_template_id IN (SELECT id FROM quotation_templates WHERE template_key = 'default')`
        );
        await queryInterface.sequelize.query(
            `DELETE FROM quotation_templates WHERE template_key = 'default'`
        );
    },
};
