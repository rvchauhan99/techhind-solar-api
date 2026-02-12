/* eslint-disable no-await-in-loop */
"use strict";

const IGNORED_TABLES = new Set(["SequelizeMeta"]);

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

const TIMESTAMP_COLUMNS = (Sequelize) => ({
  created_at: {
    type: Sequelize.DATE,
    allowNull: true,
    defaultValue: Sequelize.fn("NOW"),
  },
  updated_at: {
    type: Sequelize.DATE,
    allowNull: true,
    defaultValue: Sequelize.fn("NOW"),
  },
});

const normalizeTable = (rawTable) => {
  if (typeof rawTable === "string") {
    return { tableName: rawTable };
  }

  if (rawTable && typeof rawTable === "object") {
    return {
      tableName: rawTable.tableName || rawTable.name,
      schema: rawTable.schema || rawTable.schemaName,
    };
  }

  return { tableName: null };
};

const describeTableSafe = async (queryInterface, tableRef) => {
  const { tableName, schema } = tableRef;
  if (!tableName) return null;
  try {
    if (schema) {
      return await queryInterface.describeTable(tableName, { schema });
    }
    return await queryInterface.describeTable(tableName);
  } catch (error) {
    // If describeTable fails (e.g. view), skip gracefully
    console.warn(`Skipping audit migration for ${schema ? `${schema}.` : ""}${tableName}: ${error.message}`);
    return null;
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const auditColumns = AUDIT_COLUMNS(Sequelize);
    const timestampColumns = TIMESTAMP_COLUMNS(Sequelize);

    for (const rawTable of tables) {
      const tableRef = normalizeTable(rawTable);
      const { tableName } = tableRef;
      if (!tableName || IGNORED_TABLES.has(tableName)) continue;

      const tableDefinition = await describeTableSafe(queryInterface, tableRef);
      if (!tableDefinition) continue;

      for (const [columnName, columnDefinition] of Object.entries(timestampColumns)) {
        if (!tableDefinition[columnName]) {
          await queryInterface.addColumn(tableRef, columnName, columnDefinition);
        }
      }

      for (const [columnName, columnDefinition] of Object.entries(auditColumns)) {
        if (!tableDefinition[columnName]) {
          await queryInterface.addColumn(tableRef, columnName, columnDefinition);
        }
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const auditColumns = AUDIT_COLUMNS(Sequelize);
    const timestampColumns = TIMESTAMP_COLUMNS(Sequelize);

    for (const rawTable of tables) {
      const tableRef = normalizeTable(rawTable);
      const { tableName } = tableRef;
      if (!tableName || IGNORED_TABLES.has(tableName)) continue;

      const tableDefinition = await describeTableSafe(queryInterface, tableRef);
      if (!tableDefinition) continue;

      for (const columnName of Object.keys(auditColumns)) {
        if (tableDefinition[columnName]) {
          await queryInterface.removeColumn(tableRef, columnName);
        }
      }

      for (const columnName of Object.keys(timestampColumns)) {
        if (tableDefinition[columnName]) {
          await queryInterface.removeColumn(tableRef, columnName);
        }
      }
    }
  },
};
