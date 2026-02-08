"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db.js");

const SiteVisit = sequelize.define(
  "SiteVisit",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    inquiry_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    visit_status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    next_reminder_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    site_latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
      defaultValue: 0,
    },
    site_longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
      defaultValue: 0,
    },
    has_shadow_casting_object: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    shadow_reduce_suggestion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    height_of_parapet: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    roof_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    solar_panel_size_capacity: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    approx_roof_area_sqft: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    inverter_size_capacity: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    earthing_cable_size_location: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    visit_photo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    left_corner_site_image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    right_corner_site_image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    left_top_corner_site_image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    right_top_corner_site_image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    drawing_image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    house_building_outside_photo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    other_images_videos: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const value = this.getDataValue("other_images_videos");
        if (!value) return null;
        try {
          return JSON.parse(value);
        } catch (e) {
          return null;
        }
      },
      set(value) {
        if (Array.isArray(value)) {
          this.setDataValue("other_images_videos", JSON.stringify(value));
        } else if (value === null || value === undefined) {
          this.setDataValue("other_images_videos", null);
        } else {
          this.setDataValue("other_images_videos", value);
        }
      },
    },
    do_not_send_message: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    visit_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    visited_by: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    visit_assign_to: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    schedule_on: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    schedule_remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "site_visits",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
);

module.exports = SiteVisit;

