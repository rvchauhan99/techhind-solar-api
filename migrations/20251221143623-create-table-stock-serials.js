"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("stock_serials", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "products",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      warehouse_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "company_warehouses",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      stock_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "stocks",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      serial_number: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "AVAILABLE",
      },
      source_type: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      source_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      inward_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      outward_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
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
    });

    // Add unique constraint on serial_number
    // Note: We'll validate uniqueness at application level for non-null values
    await queryInterface.addConstraint("stock_serials", {
      fields: ["serial_number"],
      type: "unique",
      name: "stock_serials_serial_number_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("stock_serials");
  },
};

