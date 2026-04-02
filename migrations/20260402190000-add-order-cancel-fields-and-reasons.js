"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableOrders = await queryInterface.describeTable("orders");
    
    // 1. Add cancellation_reason_id column if missing
    if (!tableOrders.cancellation_reason_id) {
      await queryInterface.addColumn("orders", "cancellation_reason_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "reasons",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }

    // 2. Add cancellation_remarks column if missing
    if (!tableOrders.cancellation_remarks) {
      await queryInterface.addColumn("orders", "cancellation_remarks", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    // 3. Seed basic reasons for "order_cancellation"
    const basicReasons = [
      "Customer changed mind",
      "Found better price elsewhere",
      "Delayed delivery",
      "Technical feasibility issue",
      "Financial issues",
      "Duplicate order",
      "Wrong product selected",
      "Other",
    ];

    for (const reason of basicReasons) {
      await queryInterface.sequelize.query(
        `INSERT INTO reasons (reason_type, reason, is_active, created_at, updated_at)
         SELECT 'order_cancellation', :reason, true, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM reasons WHERE reason_type = 'order_cancellation' AND reason = :reason
         )`,
        {
          replacements: { reason },
          type: Sequelize.QueryTypes.INSERT,
        }
      );
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableOrders = await queryInterface.describeTable("orders");
    
    if (tableOrders.cancellation_remarks) {
      await queryInterface.removeColumn("orders", "cancellation_remarks");
    }
    if (tableOrders.cancellation_reason_id) {
      await queryInterface.removeColumn("orders", "cancellation_reason_id");
    }
    
    // Note: We don't delete seed data in down to avoid breaking existing records
  },
};
