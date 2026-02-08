"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Step 1: Drop the existing foreign key constraint
    await queryInterface.sequelize.query(`
      DO $$ 
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'purchase_orders_bill_to_id_fkey' 
          AND table_name = 'purchase_orders'
        ) THEN
          ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_bill_to_id_fkey;
        END IF;
      END $$;
    `);

    // Step 2: Get the first company ID to set as default for existing records
    const [companies] = await queryInterface.sequelize.query(`
      SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY id LIMIT 1;
    `);

    const firstCompanyId = companies.length > 0 ? companies[0].id : null;

    // Step 3: Update existing records to use first company (if exists)
    if (firstCompanyId) {
      await queryInterface.sequelize.query(`
        UPDATE purchase_orders 
        SET bill_to_id = ${firstCompanyId} 
        WHERE bill_to_id IS NOT NULL AND deleted_at IS NULL;
      `);
    }

    // Step 4: Add new foreign key constraint to companies table
    await queryInterface.addConstraint("purchase_orders", {
      fields: ["bill_to_id"],
      type: "foreign key",
      name: "purchase_orders_bill_to_id_fkey",
      references: {
        table: "companies",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    // Drop the companies foreign key
    await queryInterface.sequelize.query(`
      DO $$ 
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'purchase_orders_bill_to_id_fkey' 
          AND table_name = 'purchase_orders'
        ) THEN
          ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_bill_to_id_fkey;
        END IF;
      END $$;
    `);

    // Get the first branch ID to set as default
    const [branches] = await queryInterface.sequelize.query(`
      SELECT id FROM company_branches WHERE deleted_at IS NULL ORDER BY id LIMIT 1;
    `);

    const firstBranchId = branches.length > 0 ? branches[0].id : null;

    if (firstBranchId) {
      await queryInterface.sequelize.query(`
        UPDATE purchase_orders 
        SET bill_to_id = ${firstBranchId} 
        WHERE bill_to_id IS NOT NULL AND deleted_at IS NULL;
      `);
    }

    // Add back the company_branches foreign key
    await queryInterface.addConstraint("purchase_orders", {
      fields: ["bill_to_id"],
      type: "foreign key",
      name: "purchase_orders_bill_to_id_fkey",
      references: {
        table: "company_branches",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },
};

