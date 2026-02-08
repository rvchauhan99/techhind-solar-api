"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn("orders", "fabricator_installer_are_same", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        });
        await queryInterface.addColumn("orders", "fabricator_installer_id", {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
                model: "users",
                key: "id",
            },
        });
        await queryInterface.addColumn("orders", "fabricator_id", {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
                model: "users",
                key: "id",
            },
        });
        await queryInterface.addColumn("orders", "installer_id", {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
                model: "users",
                key: "id",
            },
        });
        await queryInterface.addColumn("orders", "fabrication_due_date", {
            type: Sequelize.DATEONLY,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "installation_due_date", {
            type: Sequelize.DATEONLY,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "fabrication_remarks", {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "fabrication_completed_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn("orders", "fabricator_installer_are_same");
        await queryInterface.removeColumn("orders", "fabricator_installer_id");
        await queryInterface.removeColumn("orders", "fabricator_id");
        await queryInterface.removeColumn("orders", "installer_id");
        await queryInterface.removeColumn("orders", "fabrication_due_date");
        await queryInterface.removeColumn("orders", "installation_due_date");
        await queryInterface.removeColumn("orders", "fabrication_remarks");
        await queryInterface.removeColumn("orders", "fabrication_completed_at");
    },
};
