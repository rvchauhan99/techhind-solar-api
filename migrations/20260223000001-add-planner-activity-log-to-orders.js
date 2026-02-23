"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            "orders",
            "planner_activity_log",
            {
                type: Sequelize.JSON,
                allowNull: true,
                defaultValue: [],
                comment: "Append-only log of planner/BOM actions: [{ action, at, user_id, user_name?, product_id?, product_name?, old_qty?, new_qty? }]",
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("orders", "planner_activity_log");
    },
};
