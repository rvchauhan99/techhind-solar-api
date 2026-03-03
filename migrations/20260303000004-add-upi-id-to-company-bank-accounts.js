"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("company_bank_accounts", "upi_id", {
            type: Sequelize.STRING,
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("company_bank_accounts", "upi_id");
    },
};
