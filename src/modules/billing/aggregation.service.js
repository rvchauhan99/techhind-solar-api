"use strict";

const { getRegistrySequelize } = require("../../config/registryDb.js");

const WEIGHTS = {
  api_requests: 1,
  pdf_generated: 50,
  active_users: 10,
  storage_gb: 5,
};

/**
 * Sum daily usage per tenant for a given month. Returns monthly totals and usage score per tenant.
 * Only includes tenants with status 'active' and mode 'shared' (from tenants table).
 * @param {string} month - YYYY-MM
 * @returns {Promise<Array<{ tenant_id: string, api_requests: number, pdf_generated: number, active_users: number, storage_gb: number, usage_score: number }>>}
 */
async function getMonthlyUsageByTenant(month) {
  const sequelize = getRegistrySequelize();
  if (!sequelize) return [];

  const startDate = `${month}-01`;
  const [endYear, endMonth] = month.split("-").map(Number);
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const rows = await sequelize.query(
    `SELECT
       c.tenant_id,
       COALESCE(SUM(c.api_requests), 0)::int AS api_requests,
       COALESCE(SUM(c.pdf_generated), 0)::int AS pdf_generated,
       COALESCE(SUM(c.active_users), 0)::int AS active_users,
       COALESCE(SUM(c.storage_gb), 0)::numeric AS storage_gb
     FROM customer_usage_daily c
     INNER JOIN tenants t ON t.id = c.tenant_id AND t.status = 'active' AND t.mode = 'shared'
     WHERE c.date >= :startDate AND c.date <= :endDate
     GROUP BY c.tenant_id`,
    {
      replacements: { startDate, endDate },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const result = Array.isArray(rows) ? rows : [rows];
  return result.map((r) => {
    const api_requests = Number(r.api_requests) || 0;
    const pdf_generated = Number(r.pdf_generated) || 0;
    const active_users = Number(r.active_users) || 0;
    const storage_gb = Number(r.storage_gb) || 0;
    const usage_score =
      api_requests * WEIGHTS.api_requests +
      pdf_generated * WEIGHTS.pdf_generated +
      active_users * WEIGHTS.active_users +
      storage_gb * WEIGHTS.storage_gb;
    return {
      tenant_id: r.tenant_id,
      api_requests,
      pdf_generated,
      active_users,
      storage_gb,
      usage_score,
    };
  });
}

module.exports = { getMonthlyUsageByTenant, WEIGHTS };
