"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("followups", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      inquiry_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "inquiries",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      inquiry_status: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      remarks: { type: Sequelize.TEXT, allowNull: true },
      next_reminder: { type: Sequelize.DATE, allowNull: true },
      call_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      is_schedule_site_visit: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_msg_send_to_customer: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      rating: {
        type: Sequelize.STRING,
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
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("followups");
  },
};

