"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            "orders",
            "project_price_id",
            {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "project_prices", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("orders", "project_price_id");
    },
};
