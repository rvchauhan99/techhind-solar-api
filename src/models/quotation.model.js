"use strict";

const { DataTypes, QueryTypes } = require("sequelize");
const sequelize = require("../config/db.js");
const { QUOTATION_STATUS } = require("../common/utils/constants.js");

// Helper to generate quotation number: YYMM### (uses tenant-bound sequelize when available)
const generateQuotationNumber = async (seq) => {
    const db = seq || sequelize;
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const yymm = `${year}${month}`;

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const results = await db.query(
        `SELECT COUNT(*) as count 
     FROM quotations 
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

    // Calculate random range based on quotation count
    const minRange = (count + 1) * 10;
    const maxRange = (count + 2) * 10 - 1;

    // Generate random number in the range
    const randomNum = Math.floor(Math.random() * (maxRange - minRange + 1)) + minRange;

    return `${yymm}${randomNum}`;
};

const Quotation = sequelize.define(
    "Quotation",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        // Basic Details
        quotation_number: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
        },
        quotation_date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        valid_till: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        user_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        branch_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        inquiry_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        is_approved: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        status: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: QUOTATION_STATUS.DRAFT,
            validate: {
                isIn: [Object.values(QUOTATION_STATUS)],
            },
        },
        status_on: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },

        // Customer Details
        customer_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        customer_name: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        mobile_number: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        company_name: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        state_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        address: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        // Project Details
        order_type_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        project_scheme_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        project_price_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        project_capacity: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        price_per_kw: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        total_project_value: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        structure_amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        subsidy_amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        state_subsidy_amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        netmeter_amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        stamp_charges: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        state_government_amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        discount_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        discount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        gst_rate: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
        },
        additional_cost_details_1: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        additional_cost_amount_1: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        additional_cost_details_2: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        additional_cost_amount_2: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },

        // Technical Details - Structure
        structure_height: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        structure_material: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        // Technical Details - Panel
        panel_size: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        panel_quantity: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        panel_make_ids: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        panel_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        panel_warranty: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        panel_performance_warranty: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        // Technical Details - Inverter
        inverter_size: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        inverter_quantity: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        inverter_make_ids: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        inverter_warranty: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        // Technical Details - Hybrid Inverter
        hybrid_inverter_size: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        hybrid_inverter_quantity: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        hybrid_inverter_make_ids: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        hybrid_inverter_warranty: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        // Technical Details - Battery
        battery_size: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        battery_quantity: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        battery_make_ids: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        battery_type: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        battery_warranty: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        // Technical Details - ACDB
        acdb_quantity: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        acdb_description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        // Technical Details - DCDB
        dcdb_quantity: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        dcdb_description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        // Technical Details - Cable
        cable_ac_quantity: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        cable_ac_make_ids: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        cable_ac_description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        cable_dc_quantity: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        cable_dc_make_ids: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        cable_dc_description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        // Technical Details - Earthing & LA
        earthing_quantity: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        earthing_make_ids: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        earthing_description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        la_quantity: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        la_make_ids: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        la_description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        // Technical Details - Descriptions
        earthing_description_text: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        lightening_arrester_description_text: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        mis_description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        battery_description_text: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        // Terms and Conditions
        system_warranty_years: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        payment_terms: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        remarks: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        // Graph Generation Details
        graph_price_per_unit: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        graph_per_day_generation: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        graph_yearly_increment_price: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
        },
        graph_yearly_decrement_generation: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
        },

        // Final Calculations
        project_cost: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        total_payable: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        effective_cost: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        structure_product: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        panel_product: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        inverter_product: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        battery_product: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        hybrid_inverter_product: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        acdb_product: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        dcdb_product: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        cable_ac_product: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        cable_dc_product: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        earthing_product: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        la_product: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },

        // Full BOM snapshot at quotation time (product params + qty per line)
        bom_snapshot: {
            type: DataTypes.JSON,
            allowNull: true,
        },

        // Timestamps
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
        tableName: "quotations",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
);

// Quotation.beforeCreate(async (quotation, options) => {
//     if (!quotation.quotation_number) {
//         const seq = (options?.transaction?.sequelize) || quotation.sequelize;
//         quotation.quotation_number = await generateQuotationNumber(seq);
//     }
// });

module.exports = Quotation;