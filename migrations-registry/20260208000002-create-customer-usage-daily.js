"use strict";

const { DataTypes } = require("sequelize");

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("customer_usage_daily", {
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "tenants", key: "id" },
        onDelete: "CASCADE",
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      api_requests: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      pdf_generated: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      active_users: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      storage_gb: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
    });
    await queryInterface.addConstraint("customer_usage_daily", {
      fields: ["tenant_id", "date"],
      type: "primary key",
      name: "customer_usage_daily_pkey",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("customer_usage_daily");
  },
};
