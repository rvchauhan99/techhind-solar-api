"use strict";

const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");
const tenantRegistryService = require("./tenantRegistry.service.js");
const dbPoolManager = require("./dbPoolManager.js");
const bucketClientFactory = require("./bucketClientFactory.js");
const defaultSequelize = require("../../config/db.js");
const bucketService = require("../../common/services/bucket.service.js");

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
      console.log(`[tenant_id=${req.tenant.id}] ${req.method} ${req.originalUrl || req.url}`);
    }

    if (process.env.NODE_ENV === "development" && req.tenant) {
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

module.exports = { tenantContextMiddleware };
