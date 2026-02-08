"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("purchase_orders", "attachments", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: "Array of attachment objects with path, filename, size, uploaded_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("purchase_orders", "attachments");
  },
};

