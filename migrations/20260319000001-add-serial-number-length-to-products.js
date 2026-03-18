"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("products", "serial_number_length", {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: "Expected character length for serial numbers when product is serialized",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("products", "serial_number_length");
  },
};
