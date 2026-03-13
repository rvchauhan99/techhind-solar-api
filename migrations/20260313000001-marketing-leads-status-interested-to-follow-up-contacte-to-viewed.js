"use strict";

module.exports = {
  async up(queryInterface) {
    // Migrate marketing_leads: interested -> follow_up
    await queryInterface.sequelize.query(
      "UPDATE marketing_leads SET status = 'follow_up' WHERE status = 'interested'"
    );
    // Migrate marketing_leads: contacted -> viewed
    await queryInterface.sequelize.query(
      "UPDATE marketing_leads SET status = 'viewed' WHERE status = 'contacted'"
    );
    // Optional: align follow_ups outcome for consistency
    await queryInterface.sequelize.query(
      "UPDATE marketing_lead_follow_ups SET outcome = 'follow_up' WHERE outcome = 'interested'"
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "UPDATE marketing_leads SET status = 'contacted' WHERE status = 'viewed'"
    );
    // Note: interested -> follow_up is not reverted; original interested cannot be reliably restored
  },
};
