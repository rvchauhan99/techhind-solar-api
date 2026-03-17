"use strict";

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // For existing tenants that already ran 20260317000013 before we added is_default
    // the column might not exist yet. Ensure it exists before inserting rows that use it.
    const table = await queryInterface.describeTable("terms_and_conditions");
    if (!table.is_default) {
      await queryInterface.addColumn("terms_and_conditions", "is_default", {
        type: queryInterface.sequelize.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      await queryInterface.addIndex("terms_and_conditions", {
        name: "terms_and_conditions_type_default_unique",
        fields: ["type"],
        unique: true,
        where: { is_default: true },
      });
    }

    await queryInterface.bulkInsert("terms_and_conditions", [
      {
        type: "freight",
        code: "FREIGHT_BUYER_SCOPE",
        title: "Freight – buyer's scope",
        content: "Excluding in above price and to buyer's scope.",
        is_default: true,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        type: "payment_terms",
        code: "PAYMENT_100_ADVANCE",
        title: "Payment – 100% advance",
        content: "100% advance payment prior to dispatch.",
        is_default: true,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        type: "delivery_schedule",
        code: "DELIVERY_1_2_DAYS",
        title: "Delivery within 1–2 days",
        content: "To be dispatched within 1–2 working days.",
        is_default: true,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("terms_and_conditions", null, {});
  },
};

