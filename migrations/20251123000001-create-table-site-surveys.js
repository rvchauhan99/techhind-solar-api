"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("site_surveys", {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            site_visit_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                unique: true,
                references: {
                    model: "site_visits",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            survey_date: {
                type: Sequelize.DATEONLY,
                allowNull: false,
            },
            surveyor_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: {
                    model: "users",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            type_of_roof: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            remarks: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            height_of_structure: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            building_front_photo: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            roof_front_left_photo: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            roof_front_right_photo: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            roof_rear_left_photo: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            roof_rear_right_photo: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            drawing_photo: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            has_shadow_object: {
                type: Sequelize.BOOLEAN,
                allowNull: true,
                defaultValue: false,
            },
            shadow_object_photo: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            bom_detail: {
                type: Sequelize.JSON,
                allowNull: true,
                defaultValue: [],
            },
            status: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: "active",
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
        await queryInterface.dropTable("site_surveys");
    },
};
