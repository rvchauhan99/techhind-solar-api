"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("fabrications", {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            order_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                unique: true,
                references: { model: "orders", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            fabricator_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "users", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            fabrication_start_date: {
                type: Sequelize.DATEONLY,
                allowNull: true,
            },
            fabrication_end_date: {
                type: Sequelize.DATEONLY,
                allowNull: true,
            },
            structure_type: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            structure_material: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            coating_type: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            tilt_angle: {
                type: Sequelize.FLOAT,
                allowNull: true,
            },
            height_from_roof: {
                type: Sequelize.FLOAT,
                allowNull: true,
            },
            labour_category: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            labour_count: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            checklist: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            images: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            remarks: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            completed_at: {
                type: Sequelize.DATE,
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
            deleted_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("fabrications");
    },
};
