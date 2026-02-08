"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("inquiries", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      inquiry_number: { type: Sequelize.STRING, allowNull: true, unique: true },
      inquiry_source_id: { type: Sequelize.BIGINT }, // master data
      customer_id: {
        type: Sequelize.BIGINT,
        references: { model: "customers", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      date_of_inquiry: { type: Sequelize.DATEONLY },
      inquiry_by: { type: Sequelize.BIGINT }, // user master data
      handled_by: { type: Sequelize.BIGINT }, // user master data
      channel_partner: { type: Sequelize.BIGINT }, // user master data (channel partner)
      branch_id: { type: Sequelize.BIGINT }, // master data (company_branches.id)
      project_scheme_id: { type: Sequelize.BIGINT }, // master data (project_schemes.id)
      capacity: { type: Sequelize.FLOAT, defaultValue: 0 },
      order_type: { type: Sequelize.BIGINT }, // master data (order_types.id)
      discom_id: { type: Sequelize.BIGINT }, // master data (discoms.id)
      rating: { type: Sequelize.STRING }, // ?

      // Other Details
      remarks: { type: Sequelize.TEXT },
      next_reminder_date: { type: Sequelize.DATEONLY },
      reference_from: { type: Sequelize.STRING },
      estimated_cost: { type: Sequelize.FLOAT },
      payment_type: { type: Sequelize.STRING }, // ?
      do_not_send_message: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_dead: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      // Status and timestamps
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "new",
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
    await queryInterface.dropTable("inquiries");
  },
};
