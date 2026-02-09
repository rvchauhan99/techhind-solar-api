"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            "quotations",
            "bom_snapshot",
            {
                type: Sequelize.JSON,
                allowNull: true,
                comment: "Full BOM at quotation time: [{ product_id, quantity, sort_order, product_snapshot }]",
            }
        );
        await queryInterface.addColumn(
            "orders",
            "bom_snapshot",
            {
                type: Sequelize.JSON,
                allowNull: true,
                comment: "Full BOM at order time; copied from quotation when created from quote",
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("quotations", "bom_snapshot");
        await queryInterface.removeColumn("orders", "bom_snapshot");
    },
};
