"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("order_payment_details", "status", {
            type: Sequelize.ENUM("pending_approval", "approved", "rejected"),
            allowNull: false,
            defaultValue: "pending_approval",
        });

        await queryInterface.addColumn("order_payment_details", "approved_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });

        await queryInterface.addColumn("order_payment_details", "approved_by", {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
                model: "users",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        });

        await queryInterface.addColumn("order_payment_details", "rejected_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });

        await queryInterface.addColumn("order_payment_details", "rejected_by", {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
                model: "users",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        });

        await queryInterface.addColumn("order_payment_details", "rejection_reason", {
            type: Sequelize.TEXT,
            allowNull: true,
        });

        await queryInterface.addColumn("order_payment_details", "receipt_number", {
            type: Sequelize.STRING(50),
            allowNull: true,
            unique: true,
        });

        await queryInterface.addIndex("order_payment_details", ["status"]);
        await queryInterface.addIndex("order_payment_details", ["receipt_number"]);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeIndex("order_payment_details", ["receipt_number"]);
        await queryInterface.removeIndex("order_payment_details", ["status"]);

        await queryInterface.removeColumn("order_payment_details", "receipt_number");
        await queryInterface.removeColumn("order_payment_details", "rejection_reason");
        await queryInterface.removeColumn("order_payment_details", "rejected_by");
        await queryInterface.removeColumn("order_payment_details", "rejected_at");
        await queryInterface.removeColumn("order_payment_details", "approved_by");
        await queryInterface.removeColumn("order_payment_details", "approved_at");
        await queryInterface.removeColumn("order_payment_details", "status");

        await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_order_payment_details_status";');
    },
};

