"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("purchase_return_items", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      purchase_return_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "purchase_returns",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      po_inward_item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "po_inward_items",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
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
      inward_accepted_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Total accepted quantity in source PO inward line",
      },
      already_returned_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Quantity previously returned against this inward line (for info only)",
      },
      return_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
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
    await queryInterface.dropTable("purchase_return_items");
  },
};

