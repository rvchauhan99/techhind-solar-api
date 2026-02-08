"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("products", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      product_type_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "product_types", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      product_make_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "product_makes", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      product_name: { type: Sequelize.STRING, allowNull: false },
      product_description: { type: Sequelize.TEXT, allowNull: true },
      hsn_ssn_code: { type: Sequelize.STRING, allowNull: true },
      measurement_unit_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "measurement_units", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      capacity: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      barcode_number: { type: Sequelize.STRING, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      gst_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      min_stock_quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
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
      properties: { type: Sequelize.JSON, allowNull: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("products");
  },
};

