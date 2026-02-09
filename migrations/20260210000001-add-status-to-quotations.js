"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("quotations", "status", {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: "Draft",
        });
        await queryInterface.addColumn("quotations", "status_on", {
            type: Sequelize.DATEONLY,
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("quotations", "status");
        await queryInterface.removeColumn("quotations", "status_on");
    },
};
