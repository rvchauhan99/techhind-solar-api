"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const paymentTypes = [
      "Direct Payment",
      "Loan Payment",
      "PDC Payment",
    ];

    await queryInterface.bulkInsert(
      "payment_types",
      paymentTypes.map((name, index) => ({
        name,
        desc: null,
        sort_order: index + 1,
        is_active: true,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        created_by: null,
        updated_by: null,
      })),
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete(
      "payment_types",
      {
        name: {
          [Sequelize.Op.in]: ["Direct Payment", "Loan Payment", "PDC Payment"],
        },
      },
      {}
    );
  },
};

