"use strict";

const DELIVERY_CHALLAN_REVERSE_REASONS = [
  {
    reason: "Wrong material",
    description: "Material was sent by mistake or wrong item/quantity was recorded",
  },
  {
    reason: "Customer returned",
    description: "Customer/receiver returned the material back after delivery",
  },
  {
    reason: "Quantity mismatch",
    description: "Delivered quantity differs from the intended challan quantity",
  },
  {
    reason: "Damaged in transit",
    description: "Material was found damaged during transport or handover",
  },
  {
    reason: "Order Cancelled",
    description: "Order was cancelled",
  },
  {
    reason: "Other",
    description: "Other case - specify in remarks",
  }
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const reasonType = "delivery_challan_reverse";

    const rows = DELIVERY_CHALLAN_REVERSE_REASONS.map((r) => ({
      reason_type: reasonType,
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
    const reasonType = "delivery_challan_reverse";
    const reasonLabels = DELIVERY_CHALLAN_REVERSE_REASONS.map((r) => r.reason);

    await queryInterface.bulkDelete(
      "reasons",
      {
        reason_type: reasonType,
        reason: { [Sequelize.Op.in]: reasonLabels },
      },
      {}
    );
  },
};

