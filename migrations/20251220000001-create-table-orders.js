"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("orders", {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },

            order_number: {
                type: Sequelize.STRING,
                allowNull: true,
                unique: true
            },

            status: {
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: "pending"
            },

            // Reference fields
            inquiry_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "inquiries", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            quotation_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "quotations", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            inquiry_source_id: {
                type: Sequelize.BIGINT,
                allowNull: false
            },
            inquiry_by: {
                type: Sequelize.BIGINT,
                allowNull: false
            },
            handled_by: {
                type: Sequelize.BIGINT,
                allowNull: false
            },
            reference_from: {
                type: Sequelize.STRING,
                allowNull: true
            },

            // Order details
            order_date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            branch_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: { model: "company_branches", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            channel_partner_id: {
                type: Sequelize.BIGINT,
                allowNull: true
            },
            project_scheme_id: {
                type: Sequelize.BIGINT,
                allowNull: false
            },
            capacity: {
                type: Sequelize.FLOAT,
                allowNull: false
            },
            existing_pv_capacity: {
                type: Sequelize.FLOAT,
                allowNull: true
            },
            project_cost: {
                type: Sequelize.FLOAT,
                allowNull: false
            },
            discount: {
                type: Sequelize.FLOAT,
                allowNull: true,
                defaultValue: 0
            },
            order_type_id: {
                type: Sequelize.BIGINT,
                allowNull: false
            },

            // Customer details
            customer_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: { model: "customers", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },

            // Discom and utility details
            discom_id: {
                type: Sequelize.BIGINT,
                allowNull: false
            },
            consumer_no: {
                type: Sequelize.STRING,
                allowNull: false
            },
            division_id: {
                type: Sequelize.BIGINT,
                allowNull: true
            },
            sub_division_id: {
                type: Sequelize.BIGINT,
                allowNull: true
            },
            circle: {
                type: Sequelize.STRING,
                allowNull: true
            },
            demand_load: {
                type: Sequelize.FLOAT,
                allowNull: true
            },
            date_of_registration_gov: {
                type: Sequelize.DATEONLY,
                allowNull: true
            },
            application_no: {
                type: Sequelize.STRING,
                allowNull: true
            },
            guvnl_no: {
                type: Sequelize.STRING,
                allowNull: true
            },
            feasibility_date: {
                type: Sequelize.DATEONLY,
                allowNull: true
            },
            geda_registration_date: {
                type: Sequelize.DATEONLY,
                allowNull: true
            },

            // Payment details
            payment_type: {
                type: Sequelize.STRING,
                allowNull: true
            },
            loan_type_id: {
                type: Sequelize.BIGINT,
                allowNull: true
            },

            // Product references
            solar_panel_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "products", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            inverter_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "products", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            project_phase_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                references: { model: "project_phases", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },

            // Document uploads
            electricity_bill: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            house_tax_bill: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            aadhar_card: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            passport_photo: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            pan_card: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            cancelled_cheque: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            customer_sign: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            order_remarks: {
                type: Sequelize.TEXT,
                allowNull: true,
            },

            // Pipeline Tracking
            stages: {
                type: Sequelize.JSON,
                allowNull: true,
                defaultValue: {
                    estimate_generated: "pending",
                    estimate_paid: "locked",
                    planner: "locked",
                    delivery: "locked",
                    fabrication: "locked",
                    installation: "locked",
                    netmeter_apply: "locked",
                    netmeter_installed: "locked",
                    subsidy_claim: "locked",
                    subsidy_disbursed: "locked",
                },
            },
            current_stage_key: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: "estimate_generated",
            },

            // Stage 1: Estimate Generated
            estimate_quotation_serial_no: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            estimate_amount: {
                type: Sequelize.FLOAT,
                allowNull: true,
            },
            estimate_due_date: {
                type: Sequelize.DATEONLY,
                allowNull: true,
            },
            estimate_completed_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },

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
                allowNull: true
            },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("orders");
    },
};
