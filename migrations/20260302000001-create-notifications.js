"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("notifications", {
            id: {
                type: Sequelize.BIGINT,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false,
            },
            user_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                comment: "Recipient user",
            },
            type: {
                type: Sequelize.STRING(80),
                allowNull: false,
                comment:
                    "e.g. lead_assigned, inquiry_reassigned, order_stage_changed, order_fab_assigned",
            },
            module: {
                type: Sequelize.STRING(40),
                allowNull: false,
                comment: "lead | inquiry | order",
            },
            title: {
                type: Sequelize.STRING(200),
                allowNull: false,
            },
            message: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            reference_id: {
                type: Sequelize.BIGINT,
                allowNull: true,
                comment: "lead_id / inquiry_id / order_id",
            },
            reference_number: {
                type: Sequelize.STRING(60),
                allowNull: true,
                comment: "e.g. ORD-260110, ML-260110",
            },
            redirect_url: {
                type: Sequelize.STRING(300),
                allowNull: true,
            },
            action_label: {
                type: Sequelize.STRING(80),
                allowNull: true,
                defaultValue: "View",
            },
            is_read: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
            deleted_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
        });

        // Index for fast per-user queries
        await queryInterface.addIndex("notifications", ["user_id", "is_read"], {
            name: "idx_notifications_user_isread",
        });
        await queryInterface.addIndex("notifications", ["user_id", "created_at"], {
            name: "idx_notifications_user_created",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("notifications");
    },
};
