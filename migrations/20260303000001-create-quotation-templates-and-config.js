"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("quotation_templates", {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            template_key: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true,
            },
            description: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            is_default: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            deleted_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
        });

        await queryInterface.createTable("quotation_template_configs", {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            quotation_template_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: "quotation_templates", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            default_background_image_path: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            default_footer_image_path: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            page_backgrounds: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
        });

        await queryInterface.addColumn("company_branches", "quotation_template_id", {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: "quotation_templates", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("company_branches", "quotation_template_id");
        await queryInterface.dropTable("quotation_template_configs");
        await queryInterface.dropTable("quotation_templates");
    },
};
