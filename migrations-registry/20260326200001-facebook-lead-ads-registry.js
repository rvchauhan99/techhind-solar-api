"use strict";

/**
 * Registry migration: create facebook_accounts, facebook_pages, facebook_lead_forms
 * in the REGISTRY database (if those tables are needed there — typically they are not,
 * but this file exists so db:registry-migrate won't skip anything).
 *
 * In most deployments facebook_* tables live ONLY in tenant DBs.
 * This migration is intentionally a no-op (it does nothing) for the registry DB.
 * If you ever need to store FB account mappings at the registry level, implement here.
 */
module.exports = {
  async up(queryInterface) {
    // No-op for registry DB — Facebook tables belong to tenant databases.
    // They are created by the tenant migration:
    //   migrations/20260326200001-create-facebook-lead-ads-tables.js
    console.log("[registry] facebook-lead-ads: no registry tables needed — skipping.");
  },

  async down(queryInterface) {
    // No-op
  },
};
