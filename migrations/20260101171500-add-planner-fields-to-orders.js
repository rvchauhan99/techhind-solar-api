"use strict";

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn("orders", "planned_delivery_date", {
            type: Sequelize.DATE,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "planned_priority", {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "planned_warehouse_id", {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
                model: "company_warehouses",
                key: "id",
            },
        });
        await queryInterface.addColumn("orders", "planned_remarks", {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "planned_solar_panel_qty", {
            type: Sequelize.INTEGER,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "planned_inverter_qty", {
            type: Sequelize.INTEGER,
            allowNull: true,
        });
        await queryInterface.addColumn("orders", "planned_has_structure", {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "planned_has_solar_panel", {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "planned_has_inverter", {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "planned_has_acdb", {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "planned_has_dcdb", {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "planned_has_earthing_kit", {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "planned_has_cables", {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
        });
        await queryInterface.addColumn("orders", "planner_completed_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn("orders", "planned_delivery_date");
        await queryInterface.removeColumn("orders", "planned_priority");
        await queryInterface.removeColumn("orders", "planned_warehouse_id");
        await queryInterface.removeColumn("orders", "planned_remarks");
        await queryInterface.removeColumn("orders", "planned_solar_panel_qty");
        await queryInterface.removeColumn("orders", "planned_inverter_qty");
        await queryInterface.removeColumn("orders", "planned_has_structure");
        await queryInterface.removeColumn("orders", "planned_has_solar_panel");
        await queryInterface.removeColumn("orders", "planned_has_inverter");
        await queryInterface.removeColumn("orders", "planned_has_acdb");
        await queryInterface.removeColumn("orders", "planned_has_dcdb");
        await queryInterface.removeColumn("orders", "planned_has_earthing_kit");
        await queryInterface.removeColumn("orders", "planned_has_cables");
        await queryInterface.removeColumn("orders", "planner_completed_at");
    },
};
