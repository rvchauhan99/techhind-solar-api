"use strict";

const AUDIT_COLUMNS = (Sequelize) => ({
  created_by: {
    type: Sequelize.INTEGER,
    allowNull: true,
    references: {
      model: "users",
      key: "id",
    },
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
  },
  updated_by: {
    type: Sequelize.INTEGER,
    allowNull: true,
    references: {
      model: "users",
      key: "id",
    },
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
  },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    const auditColumns = AUDIT_COLUMNS(Sequelize);
    const tables = ["purchase_return_items", "purchase_return_serials"];

    for (const tableName of tables) {
      const tableDesc = await queryInterface.describeTable(tableName);
      for (const [columnName, columnDef] of Object.entries(auditColumns)) {
        if (!tableDesc[columnName]) {
          await queryInterface.addColumn(tableName, columnName, columnDef);
        }
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const auditColumns = AUDIT_COLUMNS(Sequelize);
    const tables = ["purchase_return_items", "purchase_return_serials"];

    for (const tableName of tables) {
      const tableDesc = await queryInterface.describeTable(tableName);
      for (const columnName of Object.keys(auditColumns)) {
        if (tableDesc[columnName]) {
          await queryInterface.removeColumn(tableName, columnName);
        }
      }
    }
  },
};
