"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("followups", "dead_reason_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "reasons",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("followups", "dead_reason", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("followups", "dead_remarks", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("followups", "dead_remarks");
    await queryInterface.removeColumn("followups", "dead_reason");
    await queryInterface.removeColumn("followups", "dead_reason_id");
  },
};
