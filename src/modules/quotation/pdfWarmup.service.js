"use strict";

const { getRegistrySequelize } = require("../../config/registryDb.js");
const tenantRegistryService = require("../tenant/tenantRegistry.service.js");
const dbPoolManager = require("../tenant/dbPoolManager.js");
const { getModelsForSequelize } = require("../tenant/tenantModels.js");
const bucketClientFactory = require("../tenant/bucketClientFactory.js");
const bucketService = require("../../common/services/bucket.service.js");
const pdfService = require("./pdf.service.js");
const { getImageCacheStats } = require("./pdfImageCache.service.js");
const path = require("path");

const PDF_WARMUP_ENABLED = process.env.PDF_WARMUP_ENABLED === "true";
const PDF_WARMUP_MAX_TENANTS = Math.max(1, parseInt(process.env.PDF_WARMUP_MAX_TENANTS || "5", 10));

const mimeFromKey = (key) => {
    if (!key) return "image/jpeg";
    const ext = path.extname(key).toLowerCase();
    return ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
};

const isBucketResolvablePath = (value) => {
    if (value == null) return false;
    const key = String(value).trim();
    if (!key) return false;
    if (key.startsWith("http://") || key.startsWith("https://")) return false;
    if (key.startsWith("/uploads/")) return true;
    return !key.startsWith("/");
};

const toBucketKey = (value) => {
    const key = String(value).trim();
    return key.startsWith("/uploads/") ? key.slice(1) : key;
};

async function fetchObjectDataUrl(bucketKey, mimeType, bucketClient) {
    const tryFetch = async (client) => {
        try {
            const result = client
                ? await bucketService.getObjectWithClient(client, bucketKey)
                : await bucketService.getObject(bucketKey);
            const body = result.body;
            const contentType = result.contentType || mimeType;
            const base64 = Buffer.isBuffer(body)
                ? body.toString("base64")
                : Buffer.from(body).toString("base64");
            return `data:${contentType};base64,${base64}`;
        } catch (_) {
            return null;
        }
    };

    let dataUrl = await tryFetch(bucketClient);
    if (!dataUrl && bucketClient) {
        dataUrl = await tryFetch(null);
    }
    return dataUrl;
}

/**
 * Prefetch quotation template and company branding images for active tenants into in-memory PDF image cache.
 * Run once after server start to reduce first-PDF latency and bucket load. Bounded by PDF_WARMUP_MAX_TENANTS.
 * Set PDF_WARMUP_ENABLED=true to enable.
 * @returns {Promise<{ warmed: number, errors: number, skipped: number, scanned: number }>}
 */
async function warmupTemplateAssetCache() {
    if (!PDF_WARMUP_ENABLED) return { warmed: 0, errors: 0, skipped: 0, scanned: 0 };

    const sequelize = getRegistrySequelize();
    if (!sequelize) return { warmed: 0, errors: 0, skipped: 0, scanned: 0 };

    let warmed = 0;
    let errors = 0;
    let skipped = 0;
    let scanned = 0;

    try {
        const { QueryTypes } = require("sequelize");
        const rows = await sequelize.query(
            "SELECT id FROM tenants WHERE status = 'active' ORDER BY tenant_key LIMIT :limit",
            { replacements: { limit: PDF_WARMUP_MAX_TENANTS }, type: QueryTypes.SELECT }
        );
        const tenantIds = Array.isArray(rows) ? rows.map((r) => r.id) : [];

        for (const tenantId of tenantIds) {
            try {
                const config = await tenantRegistryService.getTenantById(tenantId);
                if (!config) continue;

                const tenantSequelize = await dbPoolManager.getPool(tenantId, config);
                const models = getModelsForSequelize(tenantSequelize);
                if (!models || !models.QuotationTemplate || !models.QuotationTemplateConfig || !models.Company) continue;

                const { QuotationTemplate, QuotationTemplateConfig, Company } = models;
                const templates = await QuotationTemplate.findAll({
                    where: { deleted_at: null },
                    include: [{ model: QuotationTemplateConfig, as: "config", required: false }],
                });

                const keys = new Set();
                for (const template of templates) {
                    if (!template || !template.config) continue;
                    const configObj = template.config.toJSON ? template.config.toJSON() : template.config;
                    if (isBucketResolvablePath(configObj.default_background_image_path)) keys.add(configObj.default_background_image_path);
                    if (isBucketResolvablePath(configObj.default_footer_image_path)) keys.add(configObj.default_footer_image_path);
                    if (configObj.page_backgrounds && typeof configObj.page_backgrounds === "object") {
                        Object.values(configObj.page_backgrounds).forEach((k) => {
                            if (isBucketResolvablePath(k)) keys.add(k);
                        });
                    }
                }

                const company = await Company.findOne({
                    where: { deleted_at: null },
                    order: [["created_at", "ASC"]],
                });
                if (company) {
                    const companyObj = company.toJSON ? company.toJSON() : company;
                    ["logo", "header", "footer", "stamp"].forEach((field) => {
                        if (isBucketResolvablePath(companyObj[field])) {
                            keys.add(companyObj[field]);
                        }
                    });
                }

                const bucketClient = await bucketClientFactory.getBucketClient(tenantId, config);
                for (const rawKey of keys) {
                    scanned += 1;
                    const bucketKey = toBucketKey(rawKey);
                    try {
                        const dataUrl = await fetchObjectDataUrl(bucketKey, mimeFromKey(bucketKey), bucketClient);
                        if (!dataUrl) {
                            skipped += 1;
                            continue;
                        }
                        pdfService.setTemplateAssetDataUrl(tenantId, rawKey, dataUrl);
                        warmed += 1;
                    } catch (_) {
                        skipped += 1;
                    }
                }
            } catch (e) {
                errors += 1;
            }
        }

        if (warmed > 0 || errors > 0 || skipped > 0) {
            const stats = getImageCacheStats();
            console.info(
                `[PDF] Warmup: scanned=${scanned}, cached=${warmed}, skipped=${skipped}, errors=${errors}, cacheEntries=${stats.entries}, cacheBytes=${stats.totalBytes}`
            );
        }
    } catch (e) {
        const isConnectionError =
            /remaining connection slots|too many clients|connection limit|ECONNREFUSED|ETIMEDOUT|connection refused/i.test(
                e && e.message ? e.message : String(e)
            );
        if (isConnectionError) {
            console.warn("[PDF] Warmup skipped (connection limit or DB unavailable):", e.message);
            return { warmed: 0, errors: 1, skipped: 0, scanned: 0, _skippedReason: "connection_limit" };
        }
        console.warn("[PDF] Warmup failed:", e.message);
    }

    return { warmed, errors, skipped, scanned };
}

module.exports = { warmupTemplateAssetCache };
