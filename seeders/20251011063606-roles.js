"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    
    // Check if roles already exist
    const [existingRoles] = await queryInterface.sequelize.query(
      `SELECT name FROM roles WHERE deleted_at IS NULL`
    );
    const existingRoleNames = existingRoles.map((r) => r.name);

    const rolesToInsert = [
      {
        name: "SuperAdmin",
        description: "Full access",
        status: "active",
        created_at: now,
        updated_at: now,
      },
      {
        name: "Admin",
        description: "Full access",
        status: "active",
        created_at: now,
        updated_at: now,
      },
      {
        name: "User",
        description: "Limited access",
        status: "active",
        created_at: now,
        updated_at: now,
      },
      {
        name: "Manager",
        description: "Module management",
        status: "active",
        created_at: now,
        updated_at: now,
      },
    ].filter((role) => !existingRoleNames.includes(role.name));

    if (rolesToInsert.length > 0) {
      await queryInterface.bulkInsert("roles", rolesToInsert);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("roles", null, {});
  },
};
