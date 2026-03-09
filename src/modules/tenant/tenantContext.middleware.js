"use strict";

const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");
const { isAuditLogsEnabled } = require("../../config/auditLogs.js");
const tenantRegistryService = require("./tenantRegistry.service.js");
const dbPoolManager = require("./dbPoolManager.js");
const bucketClientFactory = require("./bucketClientFactory.js");
const defaultSequelize = require("../../config/db.js");
const bucketService = require("../../common/services/bucket.service.js");

/**
 * Resolve tenant_key for public (unauthenticated) requests.
 * Tries: req.body.tenant_key, X-Tenant-Key header, then subdomain from Host (e.g. se.techhind.in -> "se" when APP_DOMAIN=techhind.in).
 * @param {import("express").Request} req
 * @returns {string|null}
 */
function getTenantKeyForPublicRequest(req) {
  const fromBody = req.body?.tenant_key != null ? String(req.body.tenant_key).trim() : "";
  if (fromBody) return fromBody;
  const fromHeader = req.get("x-tenant-key");
  if (fromHeader && String(fromHeader).trim()) return String(fromHeader).trim();
  const domain = (process.env.APP_DOMAIN || "").replace(/^\.|\.$/g, "");
  if (domain && req.hostname) {
    const host = req.hostname.toLowerCase();
    if (host.endsWith(domain)) {
      const sub = host.slice(0, -domain.length - 1).trim();
      if (sub) return sub;
    }
  }
  return null;
}

/**
 * Middleware for public auth routes (forgot-password, verify-reset-otp, reset-password).
 * Resolves tenant from tenant_key (body, X-Tenant-Key header, or subdomain) and sets req.tenant
 * so getTenantModels() / tenant DB access works without a JWT.
 * In shared mode, tenant_key is required. In dedicated mode, uses default sequelize.
 */
async function tenantContextForPublicAuthMiddleware(req, res, next) {
  try {
    const isShared = dbPoolManager.isSharedMode();
    const tenantKey = getTenantKeyForPublicRequest(req);

    if (isShared) {
      if (!tenantKey) {
        return next(
          new AppError(
            "tenant_key is required for password reset (send in request body or X-Tenant-Key header)",
            RESPONSE_STATUS_CODES.BAD_REQUEST
          )
        );
      }
      const tenantConfig = await tenantRegistryService.getTenantByKey(tenantKey);
      if (!tenantConfig) {
        return next(
          new AppError("Tenant not found", RESPONSE_STATUS_CODES.BAD_REQUEST)
        );
      }
      const sequelize = await dbPoolManager.getPool(tenantConfig.id, tenantConfig);
      const bucket = await bucketClientFactory.getBucketClient(tenantConfig.id, tenantConfig);
      req.tenant = {
        id: tenantConfig.id,
        tenant_key: tenantConfig.tenant_key,
        mode: tenantConfig.mode,
        status: tenantConfig.status,
        sequelize,
        bucket,
      };
    } else {
      req.tenant = {
        id: process.env.DEDICATED_TENANT_ID || null,
        tenant_key: null,
        mode: "dedicated",
        status: "active",
        sequelize: defaultSequelize,
        bucket: bucketService.getClient(),
      };
    }
    if (req.tenant?.id) {
      req.tenantIdForLog = req.tenant.id;
    }

    if (isAuditLogsEnabled() && req.tenant) {
      const cfg = req.tenant.sequelize?.config;
      const db = cfg
        ? { host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.username }
        : null;
      const bucketName =
        req.tenant.bucket?.bucketName ?? req.tenant.bucket?.bucket ?? "(default from env)";
      console.log("[tenant] details (public auth):", {
        tenant_id: req.tenant.id,
        tenant_key: req.tenant.tenant_key,
        mode: req.tenant.mode,
        status: req.tenant.status,
        ...(db && { db }),
        bucket: bucketName,
      });
    }
    return next();
  } catch (err) {
    if (err.code === "TENANT_SUSPENDED" || err.code === "TENANT_NOT_FOUND") {
      return next(new AppError(err.message, RESPONSE_STATUS_CODES.BAD_REQUEST));
    }
    return next(err);
  }
}

/**
 * Middleware that runs after validateAccessToken.
 * Reads tenant_id from JWT (req.user.tenant_id), resolves tenant, attaches:
 * - req.tenant: { id, tenant_key, mode, status, sequelize, bucket: { s3, bucketName } }
 * Rejects if tenant_id missing in shared mode or tenant suspended.
 * In dedicated mode (no Registry), attaches default sequelize and bucket when tenant_id is missing.
 */
async function tenantContextMiddleware(req, res, next) {
  try {
    const tenantId = req.user?.tenant_id;
    const isShared = dbPoolManager.isSharedMode();

    if (isShared) {
      if (!tenantId) {
        return next(
          new AppError("tenant_id is required", RESPONSE_STATUS_CODES.UNAUTHORIZED)
        );
      }
      const tenantConfig = await tenantRegistryService.getTenantById(tenantId);
      if (!tenantConfig) {
        return next(
          new AppError("Tenant not found", RESPONSE_STATUS_CODES.UNAUTHORIZED)
        );
      }
      const sequelize = await dbPoolManager.getPool(tenantId, tenantConfig);
      const bucket = await bucketClientFactory.getBucketClient(tenantId, tenantConfig);
      req.tenant = {
        id: tenantConfig.id,
        tenant_key: tenantConfig.tenant_key,
        mode: tenantConfig.mode,
        status: tenantConfig.status,
        sequelize,
        bucket,
      };
    } else {
      req.tenant = {
        id: tenantId || process.env.DEDICATED_TENANT_ID || null,
        tenant_key: null,
        mode: "dedicated",
        status: "active",
        sequelize: defaultSequelize,
        bucket: bucketService.getClient(),
      };
    }
    if (req.tenant?.id) {
      req.tenantIdForLog = req.tenant.id;
    }

    if (isAuditLogsEnabled() && req.tenant) {
      const cfg = req.tenant.sequelize?.config;
      const db = cfg
        ? { host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.username }
        : null;
      const bucketName =
        req.tenant.bucket?.bucketName ?? req.tenant.bucket?.bucket ?? "(default from env)";
      console.log("[tenant] details:", {
        tenant_id: req.tenant.id,
        tenant_key: req.tenant.tenant_key,
        mode: req.tenant.mode,
        status: req.tenant.status,
        ...(db && { db }),
        bucket: bucketName,
      });
    }
    return next();
  } catch (err) {
    if (err.code === "TENANT_SUSPENDED" || err.code === "TENANT_NOT_FOUND") {
      return next(new AppError(err.message, RESPONSE_STATUS_CODES.UNAUTHORIZED));
    }
    return next(err);
  }
}

module.exports = { tenantContextMiddleware, tenantContextForPublicAuthMiddleware, getTenantKeyForPublicRequest };
