"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("site_visits", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      inquiry_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: "inquiries",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      visit_status: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      next_reminder_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      site_latitude: {
        type: Sequelize.DECIMAL(10, 8),
        allowNull: true,
        defaultValue: 0,
      },
      site_longitude: {
        type: Sequelize.DECIMAL(11, 8),
        allowNull: true,
        defaultValue: 0,
      },
      has_shadow_casting_object: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      shadow_reduce_suggestion: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      height_of_parapet: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      roof_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      solar_panel_size_capacity: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      approx_roof_area_sqft: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      inverter_size_capacity: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      earthing_cable_size_location: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      visit_photo: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      left_corner_site_image: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      right_corner_site_image: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      left_top_corner_site_image: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      right_top_corner_site_image: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      drawing_image: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      house_building_outside_photo: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      other_images_videos: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      do_not_send_message: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      visit_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      visited_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      visit_assign_to: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      schedule_on: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      schedule_remarks: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "active",
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
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("site_visits");
  },
};

