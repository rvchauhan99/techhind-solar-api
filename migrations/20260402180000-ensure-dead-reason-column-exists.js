"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInquiries = await queryInterface.describeTable("inquiries");
    if (!tableInquiries.dead_reason) {
      await queryInterface.addColumn("inquiries", "dead_reason", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    const tableFollowups = await queryInterface.describeTable("followups");
    if (!tableFollowups.dead_reason) {
      await queryInterface.addColumn("followups", "dead_reason", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInquiries = await queryInterface.describeTable("inquiries");
    if (tableInquiries.dead_reason) {
      await queryInterface.removeColumn("inquiries", "dead_reason");
    }

    const tableFollowups = await queryInterface.describeTable("followups");
    if (tableFollowups.dead_reason) {
      await queryInterface.removeColumn("followups", "dead_reason");
    }
  },
};
