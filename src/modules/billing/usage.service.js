"use strict";

const { getRegistrySequelize } = require("../../config/registryDb.js");

/**
 * Increment api_requests for tenant for today. Writes to Registry DB customer_usage_daily.
 * @param {string} tenantId - UUID
 */
async function incrementApiRequests(tenantId) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) return;
  const today = new Date().toISOString().slice(0, 10);
  await sequelize.query(
    `INSERT INTO customer_usage_daily (tenant_id, date, api_requests, pdf_generated, active_users, storage_gb)
     VALUES (:tenant_id, :date, 1, 0, 0, 0)
     ON CONFLICT (tenant_id, date) DO UPDATE SET api_requests = customer_usage_daily.api_requests + 1`,
    { replacements: { tenant_id: tenantId, date: today } }
  );
}

/**
 * Increment pdf_generated for tenant for today.
 * @param {string} tenantId - UUID
 */
async function incrementPdfGenerated(tenantId) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) return;
  const today = new Date().toISOString().slice(0, 10);
  await sequelize.query(
    `INSERT INTO customer_usage_daily (tenant_id, date, api_requests, pdf_generated, active_users, storage_gb)
     VALUES (:tenant_id, :date, 0, 1, 0, 0)
     ON CONFLICT (tenant_id, date) DO UPDATE SET pdf_generated = customer_usage_daily.pdf_generated + 1`,
    { replacements: { tenant_id: tenantId, date: today } }
  );
}

/**
 * Record user activity for today (for active_users rollup). Upsert into user_activity_daily.
 * @param {string} tenantId - UUID
 * @param {string|number} userId - User ID
 */
async function recordUserActivity(tenantId, userId) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) return;
  const today = new Date().toISOString().slice(0, 10);
  const uid = String(userId);
  await sequelize.query(
    `INSERT INTO user_activity_daily (tenant_id, date, user_id, created_at)
     VALUES (:tenant_id, :date, :user_id, NOW())
     ON CONFLICT (tenant_id, date, user_id) DO NOTHING`,
    { replacements: { tenant_id: tenantId, date: today, user_id: uid } }
  ).catch(() => {});
}

/**
 * Aggregate active_users from user_activity_daily into customer_usage_daily for a given date.
 * Call from a daily job.
 * @param {string} date - YYYY-MM-DD
 */
async function aggregateActiveUsersForDate(date) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) return;
  await sequelize.query(
    `INSERT INTO customer_usage_daily (tenant_id, date, api_requests, pdf_generated, active_users, storage_gb)
     SELECT tenant_id, :date, 0, 0, cnt, 0
     FROM (
       SELECT tenant_id, COUNT(DISTINCT user_id) AS cnt
       FROM user_activity_daily
       WHERE date = :date
       GROUP BY tenant_id
     ) t
     ON CONFLICT (tenant_id, date) DO UPDATE SET active_users = EXCLUDED.active_users`,
    { replacements: { date } }
  );
}

/**
 * Upsert storage_gb for a tenant for a date. Call from daily job that lists bucket size.
 * @param {string} tenantId - UUID
 * @param {string} date - YYYY-MM-DD
 * @param {number} storageGb - Storage in GB
 */
async function setStorageGb(tenantId, date, storageGb) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) return;
  await sequelize.query(
    `INSERT INTO customer_usage_daily (tenant_id, date, api_requests, pdf_generated, active_users, storage_gb)
     VALUES (:tenant_id, :date, 0, 0, 0, :storage_gb)
     ON CONFLICT (tenant_id, date) DO UPDATE SET storage_gb = EXCLUDED.storage_gb`,
    { replacements: { tenant_id: tenantId, date, storage_gb: storageGb } }
  );
}

module.exports = {
  incrementApiRequests,
  incrementPdfGenerated,
  recordUserActivity,
  aggregateActiveUsersForDate,
  setStorageGb,
};
