"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("companies", "authorized_signature", {
      type: Sequelize.STRING,
      allowNull: true,
      after: "stamp",
    });

    await queryInterface.addColumn("companies", "stamp_with_signature", {
      type: Sequelize.STRING,
      allowNull: true,
      after: "authorized_signature",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("companies", "stamp_with_signature");
    await queryInterface.removeColumn("companies", "authorized_signature");
  },
};

