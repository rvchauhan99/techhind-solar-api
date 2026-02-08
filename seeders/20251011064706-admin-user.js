"use strict";

const bcrypt = require("bcrypt");

module.exports = {
  async up(queryInterface, Sequelize) {
    // Fetch role dynamically
    const [roles] = await queryInterface.sequelize.query(
      `SELECT id, name FROM roles WHERE deleted_at IS NULL`
    );
    const adminRole = roles.find((r) => r.name === "SuperAdmin");

    if (!adminRole)
      throw new Error("Admin role not found. Please seed roles first.");

    // Check if users already exist
    const [existingUsers] = await queryInterface.sequelize.query(
      `SELECT email FROM users WHERE deleted_at IS NULL`
    );
    const existingEmails = existingUsers.map((u) => u.email);

    const hashedPassword = await bcrypt.hash("Admin@123", 10);
    const now = new Date();

    const usersToInsert = [
      {
        name: "Super Admin User",
        email: "superadmin@user.com",
        password: hashedPassword,
        google_id: null,
        photo: null,
        role_id: adminRole.id,
        status: "active",
        last_login: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      {
        name: "Admin User",
        email: "admin@user.com",
        password: hashedPassword,
        google_id: null,
        photo: null,
        role_id: adminRole.id,
        status: "active",
        last_login: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    ].filter((user) => !existingEmails.includes(user.email));

    if (usersToInsert.length > 0) {
      await queryInterface.bulkInsert("users", usersToInsert);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("users", null, {});
  },
};
