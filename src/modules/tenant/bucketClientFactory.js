"use strict";

const AWS = require("aws-sdk");
const tenantRegistryService = require("./tenantRegistry.service.js");
const { getRegistrySequelize } = require("../../config/registryDb.js");
const bucketService = require("../../common/services/bucket.service.js");

const clientCache = new Map();

/**
 * Check if app is in shared (multi-tenant) mode.
 * @returns {boolean}
 */
function isSharedMode() {
  return !!getRegistrySequelize();
}

/**
 * Get S3-compatible bucket client for the given tenant.
 * In shared mode: builds client from tenant's encrypted bucket config (cached per tenant).
 * In dedicated mode: returns the default env-based client from bucket.service.
 * @param {string} tenantId - UUID of the tenant
 * @param {object} [tenantConfig] - Optional decrypted tenant config (avoids extra lookup)
 * @returns {Promise<{ s3: AWS.S3, bucketName: string }>}
 */
async function getBucketClient(tenantId, tenantConfig) {
  if (!isSharedMode()) {
    return bucketService.getClient();
  }

  if (tenantConfig && tenantConfig.id === tenantId) {
    return getOrCreateTenantClient(tenantId, tenantConfig);
  }

  const config = await tenantRegistryService.getTenantById(tenantId);
  if (!config) {
    const err = new Error("Tenant not found");
    err.code = "TENANT_NOT_FOUND";
    throw err;
  }
  return getOrCreateTenantClient(tenantId, config);
}

/**
 * Create or return cached S3 client for a tenant's bucket.
 * @param {string} tenantId
 * @param {object} config - Decrypted tenant config with bucket_* fields
 * @returns {{ s3: AWS.S3, bucketName: string }}
 */
function getOrCreateTenantClient(tenantId, config) {
  const cached = clientCache.get(tenantId);
  if (cached) return cached;

  const {
    bucket_name,
    bucket_access_key,
    bucket_secret_key,
    bucket_region,
    bucket_provider,
  } = config;

  if (!bucket_name || !bucket_access_key || !bucket_secret_key) {
    const err = new Error("Tenant bucket config incomplete");
    err.code = "TENANT_BUCKET_CONFIG_INCOMPLETE";
    throw err;
  }

  const endpoint = config.bucket_endpoint || inferEndpoint(config.bucket_provider, bucket_name);
  const s3Endpoint = new AWS.Endpoint(endpoint);
  const s3 = new AWS.S3({
    endpoint: s3Endpoint,
    accessKeyId: bucket_access_key,
    secretAccessKey: bucket_secret_key,
    region: bucket_region || "auto",
    s3ForcePathStyle: true,
    signatureVersion: "v4",
  });
  const result = { s3, bucketName: bucket_name };
  clientCache.set(tenantId, result);
  return result;
}

function inferEndpoint(provider, bucketName) {
  if (provider === "r2" || (process.env.BUCKET_ENDPOINT && process.env.BUCKET_ENDPOINT.includes("r2"))) {
    return process.env.BUCKET_ENDPOINT || `https://${process.env.CLOUDFLARE_ACCOUNT_ID || "account"}.r2.cloudflarestorage.com`;
  }
  if (provider === "spaces") {
    return process.env.BUCKET_ENDPOINT || "https://nyc3.digitaloceanspaces.com";
  }
  return process.env.BUCKET_ENDPOINT || "https://s3.amazonaws.com";
}

/**
 * Clear cached client for a tenant (e.g. after config change).
 * @param {string} tenantId
 */
function clearClient(tenantId) {
  clientCache.delete(tenantId);
}

module.exports = { getBucketClient, isSharedMode, clearClient };
