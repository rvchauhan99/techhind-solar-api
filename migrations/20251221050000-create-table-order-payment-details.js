'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('order_payment_details', {
            id: {
                type: Sequelize.BIGINT,
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
            date_of_payment: {
                type: Sequelize.DATE,
                allowNull: false
            },
            payment_amount: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false
            },
            payment_mode_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: {
                    model: 'payment_modes',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT'
            },
            transaction_cheque_date: {
                type: Sequelize.DATE,
                allowNull: true
            },
            transaction_cheque_number: {
                type: Sequelize.STRING,
                allowNull: true
            },
            bank_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: {
                    model: 'banks',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT'
            },
            company_bank_account_id: {
                type: Sequelize.BIGINT,
                allowNull: false,
                references: {
                    model: 'company_bank_accounts',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT'
            },
            receipt_cheque_file: {
                type: Sequelize.STRING,
                allowNull: true
            },
            payment_remarks: {
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

        // Add indexes
        await queryInterface.addIndex('order_payment_details', ['order_id']);
        await queryInterface.addIndex('order_payment_details', ['date_of_payment']);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('order_payment_details');
    }
};
