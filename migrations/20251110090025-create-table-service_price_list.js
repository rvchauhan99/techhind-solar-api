"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("service_price_lists", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      description: { type: Sequelize.STRING, allowNull: false },
      long_description: { type: Sequelize.STRING, allowNull: true },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      unit_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "measurement_units", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      gst_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("service_price_lists");
  },
};


