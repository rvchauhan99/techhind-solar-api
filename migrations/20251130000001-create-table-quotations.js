"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("quotations", {
            id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },

            // Basic Details
            quotation_number: { type: Sequelize.STRING, allowNull: true, unique: true },
            quotation_date: { type: Sequelize.DATEONLY, allowNull: false },
            valid_till: { type: Sequelize.DATEONLY, allowNull: false },
            user_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: { model: "users", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            branch_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "company_branches", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            inquiry_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "inquiries", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            is_final: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },

            // Customer Details
            customer_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "customers", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            customer_name: { type: Sequelize.STRING, allowNull: true },
            mobile_number: { type: Sequelize.STRING, allowNull: true },
            email: { type: Sequelize.STRING, allowNull: true },
            company_name: { type: Sequelize.STRING, allowNull: true },
            state_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: "states", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            address: { type: Sequelize.TEXT, allowNull: true },

            // Project Details
            order_type_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: "order_types", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            project_scheme_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "project_schemes", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            project_price_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: "project_prices", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            project_capacity: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
            price_per_kw: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            total_project_value: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            structure_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            subsidy_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            state_subsidy_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            netmeter_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            stamp_charges: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            state_government_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            discount_type: { type: Sequelize.STRING, allowNull: true },
            discount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            gst_rate: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
            additional_cost_details_1: { type: Sequelize.STRING, allowNull: true },
            additional_cost_amount_1: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            additional_cost_details_2: { type: Sequelize.STRING, allowNull: true },
            additional_cost_amount_2: { type: Sequelize.DECIMAL(12, 2), allowNull: true },

            // Technical Details - Structure
            structure_height: { type: Sequelize.STRING, allowNull: true },
            structure_material: { type: Sequelize.STRING, allowNull: true },

            // Technical Details - Panel
            panel_size: { type: Sequelize.STRING, allowNull: true },
            panel_quantity: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
            panel_make_ids: { type: Sequelize.JSON, allowNull: true },
            panel_type: { type: Sequelize.STRING, allowNull: true },
            panel_warranty: { type: Sequelize.STRING, allowNull: true },
            panel_performance_warranty: { type: Sequelize.STRING, allowNull: true },

            // Technical Details - Inverter
            inverter_size: { type: Sequelize.STRING, allowNull: true },
            inverter_quantity: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
            inverter_make_ids: { type: Sequelize.JSON, allowNull: true },
            inverter_warranty: { type: Sequelize.STRING, allowNull: true },

            // Technical Details - Hybrid Inverter
            hybrid_inverter_size: { type: Sequelize.STRING, allowNull: true },
            hybrid_inverter_quantity: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
            hybrid_inverter_make_ids: { type: Sequelize.JSON, allowNull: true },
            hybrid_inverter_warranty: { type: Sequelize.STRING, allowNull: true },

            // Technical Details - Battery
            battery_size: { type: Sequelize.STRING, allowNull: true },
            battery_quantity: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
            battery_make_ids: { type: Sequelize.JSON, allowNull: true },
            battery_type: { type: Sequelize.STRING, allowNull: true },
            battery_warranty: { type: Sequelize.STRING, allowNull: true },

            // Technical Details - ACDB
            acdb_quantity: { type: Sequelize.STRING, allowNull: true },
            acdb_description: { type: Sequelize.TEXT, allowNull: true },

            // Technical Details - DCDB
            dcdb_quantity: { type: Sequelize.STRING, allowNull: true },
            dcdb_description: { type: Sequelize.TEXT, allowNull: true },

            // Technical Details - Cable
            cable_ac_quantity: { type: Sequelize.STRING, allowNull: true },
            cable_ac_make_ids: { type: Sequelize.JSON, allowNull: true },
            cable_ac_description: { type: Sequelize.TEXT, allowNull: true },
            cable_dc_quantity: { type: Sequelize.STRING, allowNull: true },
            cable_dc_make_ids: { type: Sequelize.JSON, allowNull: true },
            cable_dc_description: { type: Sequelize.TEXT, allowNull: true },

            // Technical Details - Earthing & LA
            earthing_quantity: { type: Sequelize.STRING, allowNull: true },
            earthing_make_ids: { type: Sequelize.JSON, allowNull: true },
            earthing_description: { type: Sequelize.TEXT, allowNull: true },
            la_quantity: { type: Sequelize.STRING, allowNull: true },
            la_make_ids: { type: Sequelize.JSON, allowNull: true },
            la_description: { type: Sequelize.TEXT, allowNull: true },

            // Technical Details - Descriptions
            earthing_description_text: { type: Sequelize.TEXT, allowNull: true },
            lightening_arrester_description_text: { type: Sequelize.TEXT, allowNull: true },
            mis_description: { type: Sequelize.TEXT, allowNull: true },
            battery_description_text: { type: Sequelize.TEXT, allowNull: true },

            // Terms and Conditions
            system_warranty_years: { type: Sequelize.INTEGER, allowNull: true },
            payment_terms: { type: Sequelize.TEXT, allowNull: true },
            remarks: { type: Sequelize.TEXT, allowNull: true },

            // Graph Generation Details
            graph_price_per_unit: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
            graph_per_day_generation: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
            graph_yearly_increment_price: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
            graph_yearly_decrement_generation: { type: Sequelize.DECIMAL(5, 2), allowNull: true },

            // Final Calculations
            project_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            total_payable: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            effective_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
            structure_product: { type: Sequelize.BIGINT, allowNull: true },
            panel_product: { type: Sequelize.BIGINT, allowNull: true },
            inverter_product: { type: Sequelize.BIGINT, allowNull: true },
            battery_product: { type: Sequelize.BIGINT, allowNull: true },
            hybrid_inverter_product: { type: Sequelize.BIGINT, allowNull: true },
            acdb_product: { type: Sequelize.BIGINT, allowNull: true },
            dcdb_product: { type: Sequelize.BIGINT, allowNull: true },
            cable_ac_product: { type: Sequelize.BIGINT, allowNull: true },
            cable_dc_product: { type: Sequelize.BIGINT, allowNull: true },
            earthing_product: { type: Sequelize.BIGINT, allowNull: true },
            la_product: { type: Sequelize.BIGINT, allowNull: true },

            // Timestamps
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
        await queryInterface.dropTable("quotations");
    },
};
