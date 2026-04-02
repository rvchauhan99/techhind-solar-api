"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("products", "profit_margin_percent", {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
      comment: "Percentage markup on pre-GST purchase unit price",
    });

    // Add default platform config for profit margin
    const now = new Date();
    await queryInterface.bulkInsert("platform_configs", [
      {
        config_key: "default_product_profit_margin_percent",
        config_value: "0",
        value_type: "number",
        description: "Default profit margin percentage applied to products when not specified at product level",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("products", "profit_margin_percent");
    await queryInterface.bulkDelete("platform_configs", {
      config_key: "default_product_profit_margin_percent",
    });
  },
};
