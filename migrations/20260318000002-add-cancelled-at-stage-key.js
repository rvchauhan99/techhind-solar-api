"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("orders", "cancelled_at_stage_key", {
      type: Sequelize.STRING,
      allowNull: true,
      comment: "Exact pipeline stage key when cancelled, e.g. estimate_generated, planner, delivery",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("orders", "cancelled_at_stage_key");
  },
};

