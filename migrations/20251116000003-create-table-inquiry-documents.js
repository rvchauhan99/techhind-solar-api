"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("inquiry_documents", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      inquiry_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "inquiries", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      doc_type: { type: Sequelize.STRING, allowNull: false },
      document_path: { type: Sequelize.STRING, allowNull: false },
      remarks: { type: Sequelize.TEXT, allowNull: true },
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
    await queryInterface.dropTable("inquiry_documents");
  },
};

