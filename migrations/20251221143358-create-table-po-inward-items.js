"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("po_inward_items", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      po_inward_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "po_inwards",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      purchase_order_item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "purchase_order_items",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
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
      tracking_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      serial_required: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      ordered_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      received_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      accepted_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      rejected_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      rate: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      gst_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      taxable_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      gst_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      total_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("po_inward_items");
  },
};

