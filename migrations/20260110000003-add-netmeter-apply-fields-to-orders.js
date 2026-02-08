"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn("orders", "netmeter_applied", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "netmeter_applied_on", {
            type: Sequelize.DATEONLY,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "netmeter_apply_remarks", {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "netmeter_apply_completed_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn("orders", "netmeter_applied");
        await queryInterface.removeColumn("orders", "netmeter_applied_on");
        await queryInterface.removeColumn("orders", "netmeter_apply_remarks");
        await queryInterface.removeColumn("orders", "netmeter_apply_completed_at");
    },
};
