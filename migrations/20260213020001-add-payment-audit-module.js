"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM modules WHERE key = 'payment_audit' AND deleted_at IS NULL LIMIT 1`
    );
    if (existing.length > 0) return;

    const [parentRows] = await queryInterface.sequelize.query(
      `SELECT id FROM modules WHERE key = 'order_management' AND deleted_at IS NULL LIMIT 1`
    );
    const parentId = parentRows[0]?.id || null;

    const [maxSeq] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(sequence), 0) AS max_seq FROM modules WHERE deleted_at IS NULL`
    );
    const sequence = (maxSeq[0]?.max_seq || 0) + 1;

    await queryInterface.bulkInsert("modules", [
      {
        name: "Payment Audit",
        key: "payment_audit",
        parent_id: parentId,
        icon: "receipt_long",
        route: "/payment-audit",
        status: "active",
        sequence,
        created_at: now,
        updated_at: now,
      },
    ]);

    const [newModule] = await queryInterface.sequelize.query(
      `SELECT id FROM modules WHERE key = 'payment_audit' AND deleted_at IS NULL LIMIT 1`
    );
    const moduleId = newModule[0]?.id;
    if (!moduleId) return;

    const [roles] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name IN ('SuperAdmin', 'Admin') AND deleted_at IS NULL`
    );

    const roleModules = roles.map((r) => ({
      role_id: r.id,
      module_id: moduleId,
      can_create: false,
      can_read: true,
      can_update: true,
      can_delete: false,
      listing_criteria: "all",
      created_at: now,
      updated_at: now,
    }));

    if (roleModules.length > 0) {
      await queryInterface.bulkInsert("role_modules", roleModules, {});
    }
  },

  async down(queryInterface, Sequelize) {
    const [mod] = await queryInterface.sequelize.query(
      `SELECT id FROM modules WHERE key = 'payment_audit' AND deleted_at IS NULL LIMIT 1`
    );
    if (mod.length > 0) {
      const moduleId = mod[0].id;
      await queryInterface.sequelize.query(
        `DELETE FROM role_modules WHERE module_id = ${moduleId}`
      );
      await queryInterface.sequelize.query(
        `DELETE FROM modules WHERE id = ${moduleId}`
      );
    }
  },
};
