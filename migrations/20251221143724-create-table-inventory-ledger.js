"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("inventory_ledger", {
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
        onDelete: "RESTRICT",
      },
      transaction_type: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      transaction_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      movement_type: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      serial_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "stock_serials",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      lot_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      opening_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      closing_quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      rate: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      gst_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      performed_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      performed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Add indexes for better query performance
    await queryInterface.addIndex("inventory_ledger", {
      fields: ["product_id", "warehouse_id"],
      name: "inventory_ledger_product_warehouse_idx",
    });

    await queryInterface.addIndex("inventory_ledger", {
      fields: ["transaction_type", "transaction_id"],
      name: "inventory_ledger_transaction_idx",
    });

    await queryInterface.addIndex("inventory_ledger", {
      fields: ["performed_at"],
      name: "inventory_ledger_performed_at_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("inventory_ledger");
  },
};

