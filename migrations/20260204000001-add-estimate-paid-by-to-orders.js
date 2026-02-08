"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("orders", "estimate_paid_by", {
            type: Sequelize.STRING(50),
            allowNull: true,
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn("orders", "estimate_paid_by");
    },
};
