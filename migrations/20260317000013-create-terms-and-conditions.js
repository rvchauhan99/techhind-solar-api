"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("terms_and_conditions", {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      tenant_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      type: {
        type: Sequelize.STRING(50),
        allowNull: false, // freight | payment_terms | delivery_schedule | other
      },
      code: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex("terms_and_conditions", ["type", "is_active"]);

    // Only one default per type
    await queryInterface.addIndex("terms_and_conditions", {
      name: "terms_and_conditions_type_default_unique",
      fields: ["type"],
      unique: true,
      where: {
        is_default: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("terms_and_conditions");
  },
};

