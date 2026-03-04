"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("quotation_template_configs", "default_background_image_data", {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        await queryInterface.addColumn("quotation_template_configs", "default_footer_image_data", {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        await queryInterface.addColumn("quotation_template_configs", "page_backgrounds_data", {
            type: Sequelize.JSON,
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("quotation_template_configs", "default_background_image_data");
        await queryInterface.removeColumn("quotation_template_configs", "default_footer_image_data");
        await queryInterface.removeColumn("quotation_template_configs", "page_backgrounds_data");
    },
};
