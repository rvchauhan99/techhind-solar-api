"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn("orders", "assign_fabricator_installer_completed_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn("orders", "assign_fabricator_installer_completed_at");
    },
};
