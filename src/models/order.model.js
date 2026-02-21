"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

// Helper to generate order number: YYMM### (uses tenant-bound sequelize when available)
const generateOrderNumber = async (seq) => {
    const db = seq || sequelize;
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const yymm = `${year}${month}`;

    // Calculate start and end of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Count orders created in the current month (excluding soft-deleted)
    const results = await db.query(
        `SELECT COUNT(*) as count 
     FROM orders 
     WHERE created_at >= :startOfMonth 
       AND created_at <= :endOfMonth 
       AND deleted_at IS NULL`,
        {
            replacements: {
                startOfMonth: startOfMonth.toISOString(),
                endOfMonth: endOfMonth.toISOString(),
            },
            type: db.QueryTypes.SELECT,
        }
    );

    const count = parseInt(results[0]?.count || results[0]?.COUNT || 0) || 0;

    // Calculate random range based on order count
    const minRange = (count + 1) * 10;
    const maxRange = (count + 2) * 10 - 1;

    // Generate random number in the range
    const randomNum = Math.floor(Math.random() * (maxRange - minRange + 1)) + minRange;

    return `ORD-${yymm}${randomNum}`;
};

const Order = sequelize.define(
    "Order",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        order_number: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
        },

        status: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: "pending",
        },

        // Reference fields (FKs)
        inquiry_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        quotation_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        inquiry_source_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        inquiry_by: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        handled_by: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        reference_from: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        // Order details
        order_date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        branch_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        channel_partner_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        project_scheme_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        capacity: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        existing_pv_capacity: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        project_cost: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        discount: {
            type: DataTypes.FLOAT,
            allowNull: true,
            defaultValue: 0,
        },
        order_type_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        // Customer details (same as inquiry)
        customer_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },

        // Discom and utility details
        discom_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        consumer_no: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        division_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        sub_division_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        circle: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        demand_load: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        date_of_registration_gov: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        application_no: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        guvnl_no: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        feasibility_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        geda_registration_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },

        // Payment details
        payment_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        loan_type_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },

        // Product references
        solar_panel_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        inverter_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        project_phase_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },

        // Document uploads
        electricity_bill: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        house_tax_bill: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        aadhar_card: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        passport_photo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        pan_card: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        cancelled_cheque: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        customer_sign: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        order_remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        // Full BOM snapshot at order time (copied from quotation when created from quote)
        bom_snapshot: {
            type: DataTypes.JSON,
            allowNull: true,
        },

        // Pipeline Tracking
        stages: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: {
                estimate_generated: "pending",
                estimate_paid: "locked",
                planner: "locked",
                delivery: "locked",
                assign_fabricator_and_installer: "locked",
                fabrication: "locked",
                installation: "locked",
                netmeter_apply: "locked",
                netmeter_installed: "locked",
                subsidy_claim: "locked",
                subsidy_disbursed: "locked",
            },
        },
        current_stage_key: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: "estimate_generated",
        },

        // Overall delivery status derived from BOM shipped/pending quantities
        // Values: 'pending' | 'partial' | 'complete'
        delivery_status: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: "pending",
        },

        // Stage 1: Estimate Generated
        estimate_quotation_serial_no: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        estimate_amount: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        estimate_due_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        estimate_completed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        estimate_paid_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        estimate_paid_by: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        zero_amount_estimate: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },

        // Stage 3: Planner
        planned_delivery_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        planned_priority: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        planned_warehouse_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        planned_remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        planned_solar_panel_qty: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        planned_inverter_qty: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        planned_has_structure: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        planned_has_solar_panel: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        planned_has_inverter: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        planned_has_acdb: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        planned_has_dcdb: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        planned_has_earthing_kit: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        planned_has_cables: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        planner_completed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        // Stage 5: Assign Fabricator & Installer
        assign_fabricator_installer_completed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        // Stage 6: Fabrication
        fabricator_installer_are_same: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        fabricator_installer_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        fabricator_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        installer_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        fabrication_due_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        installation_due_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        fabrication_remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        fabrication_completed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        // Stage 7: Installation
        installation_completed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        // Stage 8: Netmeter Apply
        netmeter_applied: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        netmeter_applied_on: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        netmeter_apply_remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        netmeter_apply_completed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        // Stage 9: Netmeter Installed
        netmeter_installed: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        netmeter_serial_no: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        solarmeter_serial_no: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        generation: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        netmeter_installed_on: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        netmeter_installed_remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        generate_service: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        service_visit_scheduled_on: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        service_assign_to: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        netmeter_installed_completed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        // Stage 10: Subsidy Claim
        subsidy_claim: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        claim_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        claim_no: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        claim_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        state_subsidy_claim: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        state_claim_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        state_claim_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        state_claim_no: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        subsidy_claim_remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        subsidy_claim_completed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        // Stage 11: Subsidy Disbursed
        subsidy_disbursed: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        disbursed_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        disbursed_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        subsidy_disbursed_remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        state_disbursed: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        state_disbursed_date: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        state_disbursed_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        subsidy_disbursed_completed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updated_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        deleted_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        tableName: "orders",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
);

Order.beforeCreate(async (order, options) => {
    if (!order.order_number) {
        const seq = (options?.transaction?.sequelize) || order.sequelize;
        order.order_number = await generateOrderNumber(seq);
    }
});

module.exports = Order;
