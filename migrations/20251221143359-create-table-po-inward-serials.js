"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("po_inward_serials", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      po_inward_item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "po_inward_items",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      serial_number: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "RECEIVED",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Add unique constraint on serial_number
    await queryInterface.addConstraint("po_inward_serials", {
      fields: ["serial_number"],
      type: "unique",
      name: "po_inward_serials_serial_number_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("po_inward_serials");
  },
};

