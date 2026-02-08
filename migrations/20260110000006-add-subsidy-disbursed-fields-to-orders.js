"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Subsidy Disbursed fields
        await queryInterface.addColumn("orders", "subsidy_disbursed", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "disbursed_date", {
            type: Sequelize.DATEONLY,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "disbursed_amount", {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "subsidy_disbursed_remarks", {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "state_disbursed", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "state_disbursed_date", {
            type: Sequelize.DATEONLY,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "state_disbursed_amount", {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "subsidy_disbursed_completed_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn("orders", "subsidy_disbursed");
        await queryInterface.removeColumn("orders", "disbursed_date");
        await queryInterface.removeColumn("orders", "disbursed_amount");
        await queryInterface.removeColumn("orders", "subsidy_disbursed_remarks");
        await queryInterface.removeColumn("orders", "state_disbursed");
        await queryInterface.removeColumn("orders", "state_disbursed_date");
        await queryInterface.removeColumn("orders", "state_disbursed_amount");
        await queryInterface.removeColumn("orders", "subsidy_disbursed_completed_at");
    },
};
