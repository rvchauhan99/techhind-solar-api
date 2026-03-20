"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("challans", "is_reversed", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
        await queryInterface.addColumn("challans", "reversed_at", {
            type: Sequelize.DATE,
            allowNull: true,
        });
        await queryInterface.addColumn("challans", "reversed_by", {
            type: Sequelize.INTEGER,
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("challans", "reversed_by");
        await queryInterface.removeColumn("challans", "reversed_at");
        await queryInterface.removeColumn("challans", "is_reversed");
    },
};

