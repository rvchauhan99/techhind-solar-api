"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableName = "platform_configs";
    const table = await queryInterface.describeTable(tableName);

    if (!table.created_by) {
      await queryInterface.addColumn(tableName, "created_by", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }

    if (!table.updated_by) {
      await queryInterface.addColumn(tableName, "updated_by", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }
  },

  async down(queryInterface) {
    const tableName = "platform_configs";
    const table = await queryInterface.describeTable(tableName);

    if (table.updated_by) {
      await queryInterface.removeColumn(tableName, "updated_by");
    }

    if (table.created_by) {
      await queryInterface.removeColumn(tableName, "created_by");
    }
  },
};
