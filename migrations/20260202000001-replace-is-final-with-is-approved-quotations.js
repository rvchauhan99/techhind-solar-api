"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("quotations", "is_approved", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        await queryInterface.removeColumn("quotations", "is_final");
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.addColumn("quotations", "is_final", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        await queryInterface.removeColumn("quotations", "is_approved");
    },
};
