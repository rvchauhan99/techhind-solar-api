"use strict";

const responseHandler = require("../utils/responseHandler.js");

/**
 * Protects /admin/* routes with ADMIN_API_KEY.
 * Reads key from Authorization: Bearer <key> or x-admin-api-key header.
 * If TENANT_REGISTRY_DB_URL is not set, returns 503 "Registry not configured".
 */
function adminAuthMiddleware(req, res, next) {
  const expectedKey = process.env.ADMIN_API_KEY;
  if (!expectedKey || typeof expectedKey !== "string" || expectedKey.trim() === "") {
    return responseHandler.sendError(res, "Admin API not configured", 503);
  }

  if (!process.env.TENANT_REGISTRY_DB_URL) {
    return responseHandler.sendError(res, "Registry not configured", 503);
  }

  const bearer = req.headers.authorization;
  const headerKey = req.headers["x-admin-api-key"];
  const providedKey = bearer?.startsWith("Bearer ")
    ? bearer.slice(7).trim()
    : (headerKey && String(headerKey).trim()) || "";

  if (!providedKey || providedKey !== expectedKey) {
    return responseHandler.sendError(res, "Unauthorized", 401);
  }

  return next();
}

module.exports = { adminAuthMiddleware };
