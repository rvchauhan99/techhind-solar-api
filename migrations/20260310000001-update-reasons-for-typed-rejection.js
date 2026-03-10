"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Rename `name` -> `reason`
    await queryInterface.renameColumn("reasons", "name", "reason");

    // Add typed reason fields + audit fields
    await queryInterface.addColumn("reasons", "reason_type", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "general",
    });

    await queryInterface.addColumn("reasons", "description", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("reasons", "created_by", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });

    await queryInterface.addColumn("reasons", "updated_by", {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("reasons", "updated_by");
    await queryInterface.removeColumn("reasons", "created_by");
    await queryInterface.removeColumn("reasons", "description");
    await queryInterface.removeColumn("reasons", "reason_type");

    await queryInterface.renameColumn("reasons", "reason", "name");
  },
};

