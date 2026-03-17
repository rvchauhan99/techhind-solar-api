"use strict";

module.exports = {
  async up(queryInterface) {
    const table = await queryInterface.describeTable("company_warehouses");

    if (!table.branch_id) {
      await queryInterface.addColumn("company_warehouses", "branch_id", {
        type: queryInterface.sequelize.Sequelize.INTEGER,
        allowNull: true,
        references: { model: "company_branches", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      });
    }

    // Backfill existing rows with the company's default branch, where available
    // Assumes single-company tenant or that default branch per company is already configured.
    await queryInterface.sequelize.query(`
      UPDATE company_warehouses cw
      SET branch_id = sub.branch_id
      FROM (
        SELECT cb.company_id, cb.id AS branch_id
        FROM company_branches cb
        WHERE cb.deleted_at IS NULL
          AND cb.is_active = TRUE
          AND cb.is_default = TRUE
      ) AS sub
      WHERE cw.company_id = sub.company_id
        AND cw.deleted_at IS NULL
        AND cw.branch_id IS NULL;
    `);

    // Finally enforce NOT NULL for new schema
    await queryInterface.changeColumn("company_warehouses", "branch_id", {
      type: queryInterface.sequelize.Sequelize.INTEGER,
      allowNull: false,
      references: { model: "company_branches", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("company_warehouses");
    if (table.branch_id) {
      await queryInterface.removeColumn("company_warehouses", "branch_id");
    }
  },
};

