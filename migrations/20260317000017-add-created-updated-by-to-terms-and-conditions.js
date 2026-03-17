"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableName = "terms_and_conditions";
    const table = await queryInterface.describeTable(tableName);

    if (!table.created_by) {
      await queryInterface.addColumn(tableName, "created_by", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!table.updated_by) {
      await queryInterface.addColumn(tableName, "updated_by", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  down: async (queryInterface) => {
    const tableName = "terms_and_conditions";
    const table = await queryInterface.describeTable(tableName);

    if (table.created_by) {
      await queryInterface.removeColumn(tableName, "created_by");
    }

    if (table.updated_by) {
      await queryInterface.removeColumn(tableName, "updated_by");
    }
  },
};

