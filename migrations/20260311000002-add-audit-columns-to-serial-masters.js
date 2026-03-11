"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        // Add created_by / updated_by to serial_masters
        const masterDesc = await queryInterface.describeTable("serial_masters");

        if (!masterDesc.created_by) {
            await queryInterface.addColumn("serial_masters", "created_by", {
                type: Sequelize.BIGINT,
                allowNull: true,
            });
        }

        if (!masterDesc.updated_by) {
            await queryInterface.addColumn("serial_masters", "updated_by", {
                type: Sequelize.BIGINT,
                allowNull: true,
            });
        }

        // Add created_by / updated_by to serial_master_details
        const detailDesc = await queryInterface.describeTable("serial_master_details");

        if (!detailDesc.created_by) {
            await queryInterface.addColumn("serial_master_details", "created_by", {
                type: Sequelize.BIGINT,
                allowNull: true,
            });
        }

        if (!detailDesc.updated_by) {
            await queryInterface.addColumn("serial_master_details", "updated_by", {
                type: Sequelize.BIGINT,
                allowNull: true,
            });
        }
    },

    async down(queryInterface) {
        const masterDesc = await queryInterface.describeTable("serial_masters");
        if (masterDesc.updated_by) await queryInterface.removeColumn("serial_masters", "updated_by");
        if (masterDesc.created_by) await queryInterface.removeColumn("serial_masters", "created_by");

        const detailDesc = await queryInterface.describeTable("serial_master_details");
        if (detailDesc.updated_by) await queryInterface.removeColumn("serial_master_details", "updated_by");
        if (detailDesc.created_by) await queryInterface.removeColumn("serial_master_details", "created_by");
    },
};
