"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. serial_masters table
        await queryInterface.createTable("serial_masters", {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            code: {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true,
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
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

        // 2. serial_master_details table
        await queryInterface.createTable("serial_master_details", {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            serial_master_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: "serial_masters",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            sort_order: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            type: {
                type: Sequelize.STRING(30),
                allowNull: false,
                comment: "FIXED | DATE | SERIAL | FINANCIAL_YEAR | SEQUENTIALCHARACTER",
            },
            fixed_char: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            date_format: {
                type: Sequelize.STRING(20),
                allowNull: true,
            },
            width: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            start_value: {
                type: Sequelize.STRING(50),
                allowNull: true,
            },
            next_value: {
                type: Sequelize.INTEGER,
                allowNull: true,
                defaultValue: 1,
            },
            reset_value: {
                type: Sequelize.STRING(50),
                allowNull: true,
            },
            last_generated: {
                type: Sequelize.STRING(50),
                allowNull: true,
            },
            reset_interval: {
                type: Sequelize.STRING(10),
                allowNull: true,
                comment: "DAILY | MONTHLY | YEARLY | null",
            },
            last_reset_at: {
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
        });

        // Index for fast lookup by serial_master_id + sort_order
        await queryInterface.addIndex("serial_master_details", ["serial_master_id", "sort_order"], {
            name: "serial_master_details_master_sort_idx",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("serial_master_details");
        await queryInterface.dropTable("serial_masters");
    },
};
