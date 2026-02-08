"use strict";

const usageService = require("./usage.service.js");

/**
 * Runs after tenant context. Increments api_requests for req.tenant.id and records user activity (user_id) for active_users rollup.
 * Does not block: fires usage writes and calls next().
 */
function usageTrackingMiddleware(req, res, next) {
  const tenantId = req.tenant?.id;
  if (!tenantId) return next();

  usageService.incrementApiRequests(tenantId).catch(() => {});
  if (req.user?.id) {
    usageService.recordUserActivity(tenantId, req.user.id).catch(() => {});
  }
  next();
}

module.exports = { usageTrackingMiddleware };
