"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable("purchase_return_serials");
    if (!tableDesc.updated_at) {
      await queryInterface.addColumn("purchase_return_serials", "updated_at", {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      });
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable("purchase_return_serials");
    if (tableDesc.updated_at) {
      await queryInterface.removeColumn("purchase_return_serials", "updated_at");
    }
  },
};
