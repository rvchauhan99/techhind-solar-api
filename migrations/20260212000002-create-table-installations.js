"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("installations", {
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
            installer_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "users", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            installation_start_date: {
                type: Sequelize.DATEONLY,
                allowNull: true,
            },
            installation_end_date: {
                type: Sequelize.DATEONLY,
                allowNull: true,
            },
            inverter_installation_location: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            earthing_type: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            wiring_type: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            acdb_dcdb_make: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            panel_mounting_type: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            netmeter_readiness_status: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            total_panels_installed: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            inverter_serial_no: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            panel_serial_numbers: {
                type: Sequelize.JSON,
                allowNull: true,
            },
            earthing_resistance: {
                type: Sequelize.FLOAT,
                allowNull: true,
            },
            initial_generation: {
                type: Sequelize.FLOAT,
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
        await queryInterface.dropTable("installations");
    },
};
