"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Remove existing unique constraint on serial_number
    await queryInterface.removeConstraint(
      "po_inward_serials",
      "po_inward_serials_serial_number_unique"
    );

    // 2. Add product_type_id column (nullable)
    await queryInterface.addColumn("po_inward_serials", "product_type_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "product_types", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    // 3. Backfill product_type_id from po_inward_items -> products
    await queryInterface.sequelize.query(`
      UPDATE po_inward_serials
      SET product_type_id = p.product_type_id
      FROM po_inward_items pii
      INNER JOIN products p ON p.id = pii.product_id
      WHERE po_inward_serials.po_inward_item_id = pii.id
    `);

    // 4. Add unique constraint on (product_type_id, serial_number)
    await queryInterface.addConstraint("po_inward_serials", {
      fields: ["product_type_id", "serial_number"],
      type: "unique",
      name: "po_inward_serials_product_type_serial_unique",
    });
  },

  async down(queryInterface) {
    // Remove new unique constraint
    await queryInterface.removeConstraint(
      "po_inward_serials",
      "po_inward_serials_product_type_serial_unique"
    );

    // Remove product_type_id column
    await queryInterface.removeColumn("po_inward_serials", "product_type_id");

    // Restore original unique constraint on serial_number
    await queryInterface.addConstraint("po_inward_serials", {
      fields: ["serial_number"],
      type: "unique",
      name: "po_inward_serials_serial_number_unique",
    });
  },
};
