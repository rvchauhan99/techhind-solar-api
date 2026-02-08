'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('order_documents', {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            order_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: {
                    model: 'orders',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            doc_type: {
                type: Sequelize.STRING,
                allowNull: false,
                comment: 'Type of document: electricity_bill, house_tax_bill, aadhar_card, passport_photo, pan_card, cancelled_cheque, customer_sign'
            },
            document_path: {
                type: Sequelize.STRING,
                allowNull: false
            },
            remarks: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            created_at: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            deleted_at: {
                type: Sequelize.DATE,
                allowNull: true
            }
        });

        // Add index on order_id for faster lookups
        await queryInterface.addIndex('order_documents', ['order_id']);

        // Add index on doc_type for filtering
        await queryInterface.addIndex('order_documents', ['doc_type']);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('order_documents');
    }
};
