"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add tracking_type column
    await queryInterface.addColumn("products", "tracking_type", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "LOT",
    });

    // Add serial_required column
    await queryInterface.addColumn("products", "serial_required", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Add check constraint to ensure tracking_type is either 'LOT' or 'SERIAL'
    await queryInterface.sequelize.query(`
      ALTER TABLE products 
      ADD CONSTRAINT check_tracking_type 
      CHECK (tracking_type IN ('LOT', 'SERIAL'));
    `);
  },

  async down(queryInterface, Sequelize) {
    // Remove check constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE products 
      DROP CONSTRAINT IF EXISTS check_tracking_type;
    `);

    // Remove columns
    await queryInterface.removeColumn("products", "serial_required");
    await queryInterface.removeColumn("products", "tracking_type");
  },
};
