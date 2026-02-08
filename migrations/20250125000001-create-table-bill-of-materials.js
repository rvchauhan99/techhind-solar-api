"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("bill_of_materials", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      bom_code: { type: Sequelize.STRING, allowNull: true },
      bom_name: { type: Sequelize.STRING, allowNull: false },
      bom_description: { type: Sequelize.TEXT, allowNull: true },
      bom_detail: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: [],
        comment: "Array of objects: [{product_type_id, product_id, quantity, description}]",
      },
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
    await queryInterface.dropTable("bill_of_materials");
  },
};

