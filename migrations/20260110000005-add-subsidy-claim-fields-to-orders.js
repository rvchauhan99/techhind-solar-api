"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Subsidy Claim fields
        await queryInterface.addColumn("orders", "subsidy_claim", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "claim_date", {
            type: Sequelize.DATEONLY,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "claim_no", {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "claim_amount", {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "state_subsidy_claim", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "state_claim_date", {
            type: Sequelize.DATEONLY,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "state_claim_amount", {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "state_claim_no", {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "subsidy_claim_remarks", {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "subsidy_claim_completed_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn("orders", "subsidy_claim");
        await queryInterface.removeColumn("orders", "claim_date");
        await queryInterface.removeColumn("orders", "claim_no");
        await queryInterface.removeColumn("orders", "claim_amount");
        await queryInterface.removeColumn("orders", "state_subsidy_claim");
        await queryInterface.removeColumn("orders", "state_claim_date");
        await queryInterface.removeColumn("orders", "state_claim_amount");
        await queryInterface.removeColumn("orders", "state_claim_no");
        await queryInterface.removeColumn("orders", "subsidy_claim_remarks");
        await queryInterface.removeColumn("orders", "subsidy_claim_completed_at");
    },
};
