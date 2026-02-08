"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        // Create challans table
        await queryInterface.createTable("challans", {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            challan_no: {
                type: Sequelize.STRING,
                allowNull: true
            },
            challan_date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            transporter: {
                type: Sequelize.STRING,
                allowNull: true
            },
            transporter_id: {
                type: Sequelize.BIGINT,
                allowNull: true
            },
            order_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: { model: "orders", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            warehouse_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: { model: "company_warehouses", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            remarks: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            deleted_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
        });

        // Create challan_items table
        await queryInterface.createTable("challan_items", {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            challan_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: { model: "challans", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            product_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: { model: "products", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            quantity: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false
            },
            serials: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            remarks: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            deleted_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("challan_items");
        await queryInterface.dropTable("challans");
    },
};
