/* Add delivery_status column to orders */

"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("orders", "delivery_status", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: "pending",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("orders", "delivery_status");
  },
};

