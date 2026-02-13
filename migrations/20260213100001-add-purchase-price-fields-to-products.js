"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("products", "min_purchase_price", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("products", "avg_purchase_price", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("products", "max_purchase_price", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("products", "max_purchase_price");
    await queryInterface.removeColumn("products", "avg_purchase_price");
    await queryInterface.removeColumn("products", "min_purchase_price");
  },
};
