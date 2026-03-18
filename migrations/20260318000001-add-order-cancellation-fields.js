/* Add cancellation tracking fields to orders */

"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("orders", "cancelled_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("orders", "cancelled_by", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.addColumn("orders", "cancelled_stage", {
      type: Sequelize.STRING,
      allowNull: true,
      comment: "before_confirmation | after_confirmation",
    });
    await queryInterface.addColumn("orders", "cancellation_reason", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("orders", "cancellation_reason");
    await queryInterface.removeColumn("orders", "cancelled_stage");
    await queryInterface.removeColumn("orders", "cancelled_by");
    await queryInterface.removeColumn("orders", "cancelled_at");
  },
};

