"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("b2b_clients", "billing_district", {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn("b2b_clients", "billing_landmark", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await queryInterface.addColumn("b2b_client_ship_to_addresses", "district", {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn("b2b_client_ship_to_addresses", "landmark", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("b2b_clients", "billing_district");
    await queryInterface.removeColumn("b2b_clients", "billing_landmark");
    await queryInterface.removeColumn("b2b_client_ship_to_addresses", "district");
    await queryInterface.removeColumn("b2b_client_ship_to_addresses", "landmark");
  },
};
