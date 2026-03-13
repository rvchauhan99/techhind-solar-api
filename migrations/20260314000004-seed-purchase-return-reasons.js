"use strict";

const PURCHASE_RETURN_REASONS = [
  { reason: "Wrong inward / data entry mistake", description: "Inward recorded by mistake or wrong quantity/item" },
  { reason: "Defective material", description: "Goods received in defective condition" },
  { reason: "Excess quantity supplied", description: "Supplier sent more than ordered" },
  { reason: "Wrong item supplied", description: "Supplier sent different product than ordered" },
  { reason: "Quality not as per specification", description: "Quality mismatch with order" },
  { reason: "Return to supplier", description: "Material being returned to supplier" },
  { reason: "Damaged in transit", description: "Goods damaged during delivery" },
  { reason: "Expired or near expiry", description: "Product expiry issue" },
  { reason: "Other", description: "Other reason for return" },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const rows = PURCHASE_RETURN_REASONS.map((r) => ({
      reason_type: "purchase_return",
      reason: r.reason,
      description: r.description || null,
      is_active: true,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      created_by: null,
      updated_by: null,
    }));
    await queryInterface.bulkInsert("reasons", rows, {});
  },

  async down(queryInterface, Sequelize) {
    const reasonLabels = PURCHASE_RETURN_REASONS.map((r) => r.reason);
    await queryInterface.bulkDelete(
      "reasons",
      {
        reason_type: "purchase_return",
        reason: { [Sequelize.Op.in]: reasonLabels },
      },
      {}
    );
  },
};
