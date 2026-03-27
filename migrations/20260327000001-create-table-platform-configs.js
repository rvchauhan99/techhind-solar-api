"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("platform_configs", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      config_key: {
        type: Sequelize.STRING(191),
        allowNull: false,
        unique: true,
      },
      config_value: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      value_type: {
        type: Sequelize.ENUM("string", "number", "boolean", "json"),
        allowNull: false,
        defaultValue: "string",
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    await queryInterface.addIndex("platform_configs", ["config_key"], {
      name: "idx_platform_configs_config_key",
      unique: true,
    });
    await queryInterface.addIndex("platform_configs", ["is_active"], {
      name: "idx_platform_configs_is_active",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("platform_configs", "idx_platform_configs_is_active");
    await queryInterface.removeIndex("platform_configs", "idx_platform_configs_config_key");
    await queryInterface.dropTable("platform_configs");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_platform_configs_value_type";');
  },
};
