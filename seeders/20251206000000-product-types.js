"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        const now = new Date();

        const productTypes = [
            {
                name: "Dc cable",
                display_order: 1,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            },
            {
                name: "LA",
                display_order: 2,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            },
            {
                name: "Earthing",
                display_order: 3,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            },
            {
                name: "Ac cable",
                display_order: 4,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            },
            {
                name: "DCDB",
                display_order: 5,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            },
            {
                name: "ACDB",
                display_order: 6,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            },
            {
                name: "Battery",
                display_order: 7,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            },
            {
                name: "Hybrid Inverter",
                display_order: 8,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            },
            {
                name: "Inverter",
                display_order: 9,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            },
            {
                name: "Panel",
                display_order: 10,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            },
            {
                name: "Structure",
                display_order: 11,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            },
        ];

        // Check if data already exists to avoid duplicates if run multiple times
        const [existing] = await queryInterface.sequelize.query(
            "SELECT id FROM product_types LIMIT 1"
        );

        if (existing.length === 0) {
            await queryInterface.bulkInsert("product_types", productTypes);
        } else {
            console.log("Product types already exist. Skipping insertion.");
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete("product_types", null, {});
    },
};
