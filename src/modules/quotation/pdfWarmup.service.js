"use strict";

const { getRegistrySequelize } = require("../../config/registryDb.js");
const tenantRegistryService = require("../tenant/tenantRegistry.service.js");
const dbPoolManager = require("../tenant/dbPoolManager.js");
const { getModelsForSequelize } = require("../tenant/tenantModels.js");
const bucketClientFactory = require("../tenant/bucketClientFactory.js");
const bucketService = require("../../common/services/bucket.service.js");
const pdfService = require("./pdf.service.js");
const path = require("path");

const PDF_WARMUP_ENABLED = process.env.PDF_WARMUP_ENABLED === "true";
const PDF_WARMUP_MAX_TENANTS = Math.max(1, parseInt(process.env.PDF_WARMUP_MAX_TENANTS || "5", 10));

const mimeFromKey = (key) => {
    if (!key) return "image/jpeg";
    const ext = path.extname(key).toLowerCase();
    return ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
};

/**
 * Prefetch default template config images (background/footer/page) for active tenants into PDF template-asset cache.
 * Run once after server start to reduce first-PDF latency and bucket load. Bounded by PDF_WARMUP_MAX_TENANTS.
 * Set PDF_WARMUP_ENABLED=true to enable.
 * @returns {Promise<{ warmed: number, errors: number }>}
 */
async function warmupTemplateAssetCache() {
    if (!PDF_WARMUP_ENABLED) return { warmed: 0, errors: 0 };

    const sequelize = getRegistrySequelize();
    if (!sequelize) return { warmed: 0, errors: 0 };

    let warmed = 0;
    let errors = 0;

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
                if (!models || !models.QuotationTemplate || !models.QuotationTemplateConfig) continue;

                const { QuotationTemplate, QuotationTemplateConfig } = models;
                const template = await QuotationTemplate.findOne({
                    where: { is_default: true, deleted_at: null },
                    include: [{ model: QuotationTemplateConfig, as: "config", required: false }],
                });
                if (!template || !template.config) continue;

                const configObj = template.config.toJSON ? template.config.toJSON() : template.config;
                const keys = new Set();
                if (configObj.default_background_image_path) keys.add(configObj.default_background_image_path);
                if (configObj.default_footer_image_path) keys.add(configObj.default_footer_image_path);
                if (configObj.page_backgrounds && typeof configObj.page_backgrounds === "object") {
                    Object.values(configObj.page_backgrounds).forEach((k) => k && keys.add(k));
                }
                if (keys.size === 0) continue;

                const bucketClient = await bucketClientFactory.getBucketClient(tenantId, config);
                for (const key of keys) {
                    try {
                        const result = await bucketService.getObjectWithClient(bucketClient, key);
                        const body = result.body;
                        const contentType = result.contentType || mimeFromKey(key);
                        const base64 = Buffer.isBuffer(body) ? body.toString("base64") : Buffer.from(body).toString("base64");
                        const dataUrl = `data:${contentType};base64,${base64}`;
                        pdfService.setTemplateAssetDataUrl(tenantId, key, dataUrl);
                        warmed += 1;
                    } catch (e) {
                        errors += 1;
                    }
                }
            } catch (e) {
                errors += 1;
            }
        }

        if (warmed > 0 || errors > 0) {
            console.info(`[PDF] Warmup: ${warmed} template assets cached, ${errors} errors`);
        }
    } catch (e) {
        console.warn("[PDF] Warmup failed:", e.message);
    }

    return { warmed, errors };
}

module.exports = { warmupTemplateAssetCache };
