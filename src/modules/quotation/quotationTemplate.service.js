"use strict";

const { Op } = require("sequelize");
const { getTenantModels } = require("../tenant/tenantModels.js");
const bucketService = require("../../common/services/bucket.service.js");
const pdfService = require("./pdf.service.js");
const path = require("path");
const fs = require("fs");

const TEMPLATE_BASE = path.join(__dirname, "../../../templates/quotation");

const listTemplates = async (req) => {
    const models = getTenantModels(req);
    const { QuotationTemplate, QuotationTemplateConfig } = models;
    const rows = await QuotationTemplate.findAll({
        where: { deleted_at: null },
        include: [{ model: QuotationTemplateConfig, as: "config", attributes: ["id", "default_background_image_path", "default_footer_image_path"], required: false }],
        order: [["is_default", "DESC"], ["name", "ASC"]],
    });
    return rows.map((r) => {
        const j = r.toJSON();
        const config = j.config || {};
        return {
            id: j.id,
            name: j.name,
            template_key: j.template_key,
            description: j.description,
            is_default: j.is_default,
            config: {
                default_background_image_path: config.default_background_image_path,
                default_footer_image_path: config.default_footer_image_path,
                page_backgrounds: config.page_backgrounds,
            },
        };
    });
};

const getTemplateById = async (id, req) => {
    const models = getTenantModels(req);
    const { QuotationTemplate, QuotationTemplateConfig } = models;
    const row = await QuotationTemplate.findOne({
        where: { id, deleted_at: null },
        include: [{ model: QuotationTemplateConfig, as: "config", required: false }],
    });
    if (!row) return null;
    const j = row.toJSON();
    const config = j.config || {};
    return {
        ...j,
        config: {
            id: config.id,
            default_background_image_path: config.default_background_image_path,
            default_footer_image_path: config.default_footer_image_path,
            page_backgrounds: config.page_backgrounds,
        },
    };
};

const createTemplate = async (payload, req) => {
    const models = getTenantModels(req);
    const { QuotationTemplate, QuotationTemplateConfig } = models;
    const templateDir = path.join(TEMPLATE_BASE, payload.template_key);
    if (!fs.existsSync(templateDir)) {
        const err = new Error(`Template folder not found: templates/quotation/${payload.template_key}`);
        err.code = "TEMPLATE_FOLDER_NOT_FOUND";
        throw err;
    }
    if (payload.is_default) {
        await QuotationTemplate.update({ is_default: false }, { where: {} });
    }
    const created = await QuotationTemplate.create({
        name: payload.name,
        template_key: payload.template_key,
        description: payload.description || null,
        is_default: payload.is_default === true,
    });
    await QuotationTemplateConfig.create({
        quotation_template_id: created.id,
    });
    return getTemplateById(created.id, req);
};

const updateTemplate = async (id, payload, req) => {
    const models = getTenantModels(req);
    const { QuotationTemplate } = models;
    const existing = await QuotationTemplate.findOne({ where: { id, deleted_at: null } });
    if (!existing) return null;
    if (payload.is_default === true) {
        await QuotationTemplate.update({ is_default: false }, { where: { id: { [Op.ne]: id } } });
    }
    await existing.update({
        ...(payload.name != null && { name: payload.name }),
        ...(payload.description !== undefined && { description: payload.description }),
        ...(payload.is_default !== undefined && { is_default: payload.is_default }),
    });
    return getTemplateById(id, req);
};

const updateTemplateConfig = async (id, payload, req) => {
    const models = getTenantModels(req);
    const { QuotationTemplate, QuotationTemplateConfig } = models;
    const template = await QuotationTemplate.findOne({ where: { id, deleted_at: null } });
    if (!template) return null;
    let config = await QuotationTemplateConfig.findOne({ where: { quotation_template_id: id } });
    if (!config) {
        config = await QuotationTemplateConfig.create({ quotation_template_id: id });
    }
    await config.update({
        ...(payload.default_background_image_path !== undefined && { default_background_image_path: payload.default_background_image_path || null }),
        ...(payload.default_footer_image_path !== undefined && { default_footer_image_path: payload.default_footer_image_path || null }),
        ...(payload.page_backgrounds !== undefined && { page_backgrounds: payload.page_backgrounds || null }),
    });
    if (req.tenant && req.tenant.id != null) {
        pdfService.invalidatePdfCacheForTenant(req.tenant.id);
    }
    return getTemplateById(id, req);
};

const uploadTemplateConfigImage = async (id, fieldName, file, req) => {
    const models = getTenantModels(req);
    const { QuotationTemplate, QuotationTemplateConfig } = models;
    const template = await QuotationTemplate.findOne({ where: { id, deleted_at: null } });
    if (!template) return null;
    let config = await QuotationTemplateConfig.findOne({ where: { quotation_template_id: id } });
    if (!config) {
        config = await QuotationTemplateConfig.create({ quotation_template_id: id });
    }
    const bucketClient = bucketService.getBucketForRequest(req);
    const prefix = `quotation-templates/${id}`;
    const result = await bucketService.uploadFile(file, { prefix, acl: "public-read" }, bucketClient);
    const key = result.path;
    const updatePayload = {};
    if (fieldName === "default_background" || fieldName === "default_background_image_path") {
        updatePayload.default_background_image_path = key;
    } else if (fieldName === "default_footer" || fieldName === "default_footer_image_path") {
        updatePayload.default_footer_image_path = key;
    } else if (fieldName && fieldName.startsWith("page_")) {
        const pageNum = fieldName.replace("page_", "");
        const pageBackgrounds = config.page_backgrounds && typeof config.page_backgrounds === "object" ? { ...config.page_backgrounds } : {};
        pageBackgrounds[pageNum] = key;
        updatePayload.page_backgrounds = pageBackgrounds;
    }
    if (Object.keys(updatePayload).length > 0) {
        await config.update(updatePayload);
        if (req.tenant && req.tenant.id != null) {
            pdfService.invalidatePdfCacheForTenant(req.tenant.id);
        }
    }
    return { path: key, url: bucketService.getPublicUrl(key), template: await getTemplateById(id, req) };
};

module.exports = {
    listTemplates,
    getTemplateById,
    createTemplate,
    updateTemplate,
    updateTemplateConfig,
    uploadTemplateConfigImage,
};
