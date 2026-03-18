"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("payment_followups", {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      order_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: "orders",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      contacted_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      contact_channel: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      outcome: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      outcome_sub_status: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      next_follow_up_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      promised_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      promised_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
    });

    await queryInterface.addIndex("payment_followups", ["order_id"]);
    await queryInterface.addIndex("payment_followups", ["contacted_at"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("payment_followups");
  },
};
