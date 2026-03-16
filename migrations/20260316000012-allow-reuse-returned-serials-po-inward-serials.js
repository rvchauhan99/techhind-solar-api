"use strict";

/**
 * Allow reuse of returned serials in PO Inwards.
 *
 * Previously we enforced a historical-uniqueness rule on
 * (product_type_id, serial_number) via the
 * `po_inward_serials_product_type_serial_unique` constraint.
 *
 * That blocked using the same serial again in a later PO Inward
 * even after the stock serial was fully RETURNED.
 *
 * This migration:
 * - Drops the historical unique constraint.
 * - Optionally adds a narrower uniqueness rule on
 *   (po_inward_item_id, serial_number) to prevent duplicates
 *   within the same inward line while allowing reuse across time.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1) Drop old unique constraint on (product_type_id, serial_number)
    await queryInterface.removeConstraint(
      "po_inward_serials",
      "po_inward_serials_product_type_serial_unique"
    );

    // 2) Optional safety: prevent exact duplicates on the same inward item
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS po_inward_serials_item_serial_unique
      ON po_inward_serials (po_inward_item_id, serial_number)
    `);
  },

  async down(queryInterface, Sequelize) {
    // Rollback: drop the per-item index and restore the old constraint
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS po_inward_serials_item_serial_unique
    `);

    await queryInterface.addConstraint("po_inward_serials", {
      fields: ["product_type_id", "serial_number"],
      type: "unique",
      name: "po_inward_serials_product_type_serial_unique",
    });
  },
};

