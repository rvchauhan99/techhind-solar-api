"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn("orders", "netmeter_installed", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "netmeter_serial_no", {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "solarmeter_serial_no", {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "generation", {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "netmeter_installed_on", {
            type: Sequelize.DATEONLY,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "netmeter_installed_remarks", {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "generate_service", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "service_visit_scheduled_on", {
            type: Sequelize.DATEONLY,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "service_assign_to", {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
                model: "users",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        });
        await queryInterface.addColumn("orders", "netmeter_installed_completed_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn("orders", "netmeter_installed");
        await queryInterface.removeColumn("orders", "netmeter_serial_no");
        await queryInterface.removeColumn("orders", "solarmeter_serial_no");
        await queryInterface.removeColumn("orders", "generation");
        await queryInterface.removeColumn("orders", "netmeter_installed_on");
        await queryInterface.removeColumn("orders", "netmeter_installed_remarks");
        await queryInterface.removeColumn("orders", "generate_service");
        await queryInterface.removeColumn("orders", "service_visit_scheduled_on");
        await queryInterface.removeColumn("orders", "service_assign_to");
        await queryInterface.removeColumn("orders", "netmeter_installed_completed_at");
    },
};
