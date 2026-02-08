"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("company_warehouses", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      
      company_id: { 
        type: Sequelize.INTEGER, 
        allowNull: false,
        references: {
          model: "companies",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      
      // Warehouse Details
      name: { type: Sequelize.STRING, allowNull: false },
      contact_person: { type: Sequelize.STRING, allowNull: true },
      mobile: { type: Sequelize.STRING, allowNull: false },
      state_id: { 
        type: Sequelize.INTEGER, 
        allowNull: false,
        references: {
          model: "states",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      email: { type: Sequelize.STRING, allowNull: true },
      phone_no: { type: Sequelize.STRING, allowNull: true },
      address: { type: Sequelize.TEXT, allowNull: false },
      
      // Status
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
    await queryInterface.dropTable("company_warehouses");
  },
};

