"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.changeColumn("order_payment_details", "bank_id", {
            type: Sequelize.BIGINT,
            allowNull: true,
        });
        await queryInterface.changeColumn(
            "order_payment_details",
            "company_bank_account_id",
            {
                type: Sequelize.BIGINT,
                allowNull: true,
            }
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.changeColumn("order_payment_details", "bank_id", {
            type: Sequelize.BIGINT,
            allowNull: false,
        });
        await queryInterface.changeColumn(
            "order_payment_details",
            "company_bank_account_id",
            {
                type: Sequelize.BIGINT,
                allowNull: false,
            }
        );
    },
};
