"use strict";

const usageService = require("./usage.service.js");

/**
 * Runs after tenant context. Increments api_requests for req.tenant.id and records user activity (user_id) for active_users rollup.
 * Does not block: fires usage writes and calls next().
 */
function usageTrackingMiddleware(req, res, next) {
  // Registry usage tracking is intentionally disabled until multi-tenant core is stable.
  // Re-enable by setting ENABLE_REGISTRY_USAGE_TRACKING=true.
  if (String(process.env.ENABLE_REGISTRY_USAGE_TRACKING || "").toLowerCase() !== "true") {
    return next();
  }

  const tenantId = req.tenant?.id;
  if (!tenantId) return next();

  usageService.incrementApiRequests(tenantId).catch(() => {});
  if (req.user?.id) {
    usageService.recordUserActivity(tenantId, req.user.id).catch(() => {});
  }
  next();
}

module.exports = { usageTrackingMiddleware };
