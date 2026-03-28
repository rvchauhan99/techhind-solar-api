"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("order_cost_amendment_logs", {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      order_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      product_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      actor_user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      change_type: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      qty_delta: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: true,
      },
      unit_price_base: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      gst_mode: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      gst_rate: {
        type: Sequelize.DECIMAL(6, 3),
        allowNull: true,
      },
      line_amount_excluding_gst: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      line_amount_including_gst: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      project_cost_before: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
      },
      project_cost_after: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
      },
      final_payable_before: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
      },
      final_payable_after: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
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
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
    });

    await queryInterface.addIndex("order_cost_amendment_logs", ["order_id"], {
      name: "idx_order_cost_amendment_logs_order_id",
    });
    await queryInterface.addIndex("order_cost_amendment_logs", ["product_id"], {
      name: "idx_order_cost_amendment_logs_product_id",
    });
    await queryInterface.addIndex("order_cost_amendment_logs", ["actor_user_id"], {
      name: "idx_order_cost_amendment_logs_actor_user_id",
    });
    await queryInterface.addIndex("order_cost_amendment_logs", ["created_at"], {
      name: "idx_order_cost_amendment_logs_created_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("order_cost_amendment_logs");
  },
};
