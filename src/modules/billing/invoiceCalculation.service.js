"use strict";

const aggregationService = require("./aggregation.service.js");

/**
 * Calculate per-tenant invoices for a month using usage-weighted cost allocation.
 * Only active shared tenants are included. Dedicated and suspended tenants excluded.
 * @param {string} month - YYYY-MM
 * @param {number} totalInfraCost - Total infrastructure cost for the shared pool for that month
 * @returns {Promise<Array<{ tenant_id: string, usage_score: number, usage_percentage: number, final_amount: number, breakdown: { api_requests: number, pdf_generated: number, active_users: number, storage_gb: number } }>>}
 */
async function calculateInvoices(month, totalInfraCost) {
  const usageByTenant = await aggregationService.getMonthlyUsageByTenant(month);
  if (usageByTenant.length === 0) {
    return [];
  }

  const totalScore = usageByTenant.reduce((sum, u) => sum + u.usage_score, 0);
  const safeTotal = totalScore > 0 ? totalScore : 1;

  return usageByTenant.map((u) => {
    const usage_percentage = totalScore > 0 ? (u.usage_score / safeTotal) * 100 : 0;
    const final_amount = totalScore > 0 ? (u.usage_score / safeTotal) * totalInfraCost : 0;
    return {
      tenant_id: u.tenant_id,
      usage_score: u.usage_score,
      usage_percentage: Math.round(usage_percentage * 100) / 100,
      final_amount: Math.round(final_amount * 100) / 100,
      breakdown: {
        api_requests: u.api_requests,
        pdf_generated: u.pdf_generated,
        active_users: u.active_users,
        storage_gb: u.storage_gb,
      },
    };
  });
}

module.exports = { calculateInvoices };
