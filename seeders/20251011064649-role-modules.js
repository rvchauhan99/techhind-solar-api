"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // Fetch role and module IDs dynamically
    const [roles] = await queryInterface.sequelize.query(
      `SELECT id, name FROM roles WHERE name='SuperAdmin' AND deleted_at IS NULL;`
    );
    
    if (roles.length === 0) {
      throw new Error("SuperAdmin role not found. Please seed roles first.");
    }

    const adminRoleId = roles[0].id;
    const [modules] = await queryInterface.sequelize.query(
      `SELECT id, name, key FROM modules WHERE deleted_at IS NULL ORDER BY sequence;`
    );

    if (modules.length === 0) {
      throw new Error("Modules not found. Please seed modules first.");
    }

    console.log(`✅ Found SuperAdmin role (ID: ${adminRoleId})`);
    console.log(`📦 Found ${modules.length} modules to assign`);

    // Check if role_modules already exist for this role
    const [existingRoleModules] = await queryInterface.sequelize.query(
      `SELECT role_id, module_id FROM role_modules WHERE role_id = ${adminRoleId} AND deleted_at IS NULL;`
    );
    const existingRoleModuleKeys = existingRoleModules.map(
      (rm) => `${rm.role_id}-${rm.module_id}`
    );

    const roleModulesToInsert = modules
      .map((mod) => ({
        role_id: adminRoleId,
        module_id: mod.id,
        can_create: true,
        can_read: true,
        can_update: true,
        can_delete: true,
        created_at: now,
        updated_at: now,
      }))
      .filter(
        (rm) => !existingRoleModuleKeys.includes(`${rm.role_id}-${rm.module_id}`)
      );

    if (roleModulesToInsert.length > 0) {
      console.log(`✨ Assigning ${roleModulesToInsert.length} modules to SuperAdmin with full permissions...`);
      await queryInterface.bulkInsert("role_modules", roleModulesToInsert, {});
      console.log(`✅ Successfully assigned ${roleModulesToInsert.length} modules to SuperAdmin!`);
    } else {
      console.log(`✅ All modules are already assigned to SuperAdmin.`);
    }
  },

  async down(queryInterface, Sequelize) {
    const [roles] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name='SuperAdmin' AND deleted_at IS NULL;`
    );
    
    if (roles.length > 0) {
      const adminRoleId = roles[0].id;
      await queryInterface.bulkDelete(
        "role_modules",
        { role_id: adminRoleId },
        {}
      );
    }
  },
};
