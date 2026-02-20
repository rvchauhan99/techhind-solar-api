'use strict';

module.exports = {
  async up(queryInterface) {
    // `receipt_number` has a UNIQUE constraint which already creates
    // `order_payment_details_receipt_number_key` (unique index).
    // This drops the redundant non-unique index created earlier.
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS public.order_payment_details_receipt_number;'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS order_payment_details_receipt_number ON public.order_payment_details (receipt_number);'
    );
  },
};

