"use strict";

/**
 * Fix stock_adjustment_serials unique constraint.
 *
 * Problem: The table had a global UNIQUE on stock_serial_id, meaning each
 * stock_serial row could only ever appear in ONE stock_adjustment_serials row.
 * This broke "Found" adjustments for serials that were previously marked BLOCKED
 * (e.g. lost then re-found) because the old LOSS adjustment already had a row
 * for that stock_serial_id.
 *
 * Fix: Drop the global unique, replace with a composite unique on
 * (stock_adjustment_item_id, stock_serial_id) — prevents the same serial
 * appearing twice in the same adjustment item, while allowing it across
 * multiple adjustments over its lifetime (loss → found → loss, etc.).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop the old global unique constraint on stock_serial_id
    await queryInterface.removeConstraint(
      "stock_adjustment_serials",
      "stock_adjustment_serials_stock_serial_id_unique"
    );

    // Add composite unique: same serial cannot appear twice in the same adjustment item
    await queryInterface.addConstraint("stock_adjustment_serials", {
      fields: ["stock_adjustment_item_id", "stock_serial_id"],
      type: "unique",
      name: "stock_adjustment_serials_item_serial_unique",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "stock_adjustment_serials",
      "stock_adjustment_serials_item_serial_unique"
    );
    await queryInterface.addConstraint("stock_adjustment_serials", {
      fields: ["stock_serial_id"],
      type: "unique",
      name: "stock_adjustment_serials_stock_serial_id_unique",
    });
  },
};
