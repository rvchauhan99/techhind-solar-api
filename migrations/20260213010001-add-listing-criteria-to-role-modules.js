"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("role_modules", "listing_criteria", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "all",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("role_modules", "listing_criteria");
  },
};
