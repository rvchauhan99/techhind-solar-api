"use strict";

const path = require("path");
const bucketService = require("../../common/services/bucket.service.js");
const quotationService = require("./quotation.service.js");
const pdfService = require("./pdf.service.js");
const { runWithContext, setContextValue } = require("../../common/utils/requestContext.js");
const { getModelsForSequelize } = require("../tenant/tenantModels.js");
const bucketClientFactory = require("../tenant/bucketClientFactory.js");

/** Bump when PDF content/template logic changes so cache is invalidated and new PDFs use updated code. */
const PDF_CONTENT_VERSION = "2";

function buildVersionKey({ quotation, template, company, bankAccount }) {
  const configUpdatedAt =
    template && template.config && template.config.updated_at
      ? new Date(template.config.updated_at).toISOString()
      : "";
  const versionParts = [
    quotation.updated_at ? new Date(quotation.updated_at).toISOString() : "",
    template && template.updated_at ? new Date(template.updated_at).toISOString() : "",
    configUpdatedAt,
    company && company.updated_at ? new Date(company.updated_at).toISOString() : "",
    bankAccount && bankAccount.updated_at ? new Date(bankAccount.updated_at).toISOString() : "",
    PDF_CONTENT_VERSION,
  ];
  return versionParts.join("|");
}

/** Config attributes when we do NOT need inline image data (e.g. job creation: only versionKey). Excludes large *_data columns. */
const CONFIG_ATTRIBUTES_LIGHT = [
  "id",
  "quotation_template_id",
  "default_background_image_path",
  "default_footer_image_path",
  "page_backgrounds",
  "created_at",
  "updated_at",
];

async function resolvePdfMetadataForQuotation({ tenantSequelize, quotation, includeImageData = false }) {
  const models = getModelsForSequelize(tenantSequelize);
  const { Company, CompanyBankAccount, QuotationTemplate, QuotationTemplateConfig } = models;

  const configInclude = {
    model: QuotationTemplateConfig,
    as: "config",
    required: false,
    ...(includeImageData ? {} : { attributes: CONFIG_ATTRIBUTES_LIGHT }),
  };

  let template = null;
  if (quotation.branch && quotation.branch.quotation_template_id) {
    template = await QuotationTemplate.findByPk(quotation.branch.quotation_template_id, {
      where: { deleted_at: null },
      include: [configInclude],
    });
  }
  if (!template) {
    template = await QuotationTemplate.findOne({
      where: { is_default: true, deleted_at: null },
      include: [configInclude],
    });
  }

  const [company, bankAccount] = await Promise.all([
    Company.findOne({ where: { deleted_at: null } }),
    CompanyBankAccount.findOne({
      where: { deleted_at: null },
      order: [["is_default", "DESC"], ["created_at", "ASC"]],
    }),
  ]);

  const templateKey = template ? template.template_key : "default";
  const configObj = template && template.config ? (template.config.toJSON ? template.config.toJSON() : template.config) : {};
  const templateConfig =
    template && template.config
      ? {
          default_background_image_path: configObj.default_background_image_path || null,
          default_footer_image_path: configObj.default_footer_image_path || null,
          page_backgrounds: configObj.page_backgrounds || null,
          default_background_image_data: configObj.default_background_image_data || null,
          default_footer_image_data: configObj.default_footer_image_data || null,
          page_backgrounds_data: configObj.page_backgrounds_data || null,
        }
      : {};

  const versionKey = buildVersionKey({ quotation, template, company, bankAccount });
  return {
    template,
    templateKey,
    templateConfig,
    company,
    bankAccount,
    versionKey,
  };
}

async function runWithTenantRequestContext({ tenantId, tenantSequelize }, callback) {
  return runWithContext(async () => {
    setContextValue("request", { tenant: { id: tenantId, sequelize: tenantSequelize } });
    return callback();
  });
}

async function getBucketClientForTenant(tenantId) {
  if (tenantId == null || tenantId === "default") {
    return bucketService.getClient();
  }
  return bucketClientFactory.getBucketClient(String(tenantId));
}

/**
 * Build all context needed to generate a quotation PDF.
 * Uses tenant sequelize explicitly so this is usable from child processes.
 */
async function buildPdfGenerationContext({ tenantId, tenantSequelize, quotationId }) {
  const models = getModelsForSequelize(tenantSequelize);
  const bucketClient = await getBucketClientForTenant(tenantId);

  const quotation = await runWithTenantRequestContext({ tenantId, tenantSequelize }, () =>
    quotationService.getQuotationForPdf({ id: quotationId })
  );
  if (!quotation) return null;

  const [metadata, productMakesMap] = await Promise.all([
    resolvePdfMetadataForQuotation({ tenantSequelize, quotation, includeImageData: true }),
    runWithTenantRequestContext({ tenantId, tenantSequelize }, () =>
      quotationService.getProductMakesMapForPdf({ tenantId })
    ),
  ]);

  const pdfData = await pdfService.prepareQuotationData(
    quotation,
    metadata.company ? metadata.company.toJSON() : null,
    metadata.bankAccount ? metadata.bankAccount.toJSON() : null,
    productMakesMap,
    bucketClient,
    tenantId
  );

  return {
    quotation,
    versionKey: metadata.versionKey,
    pdfData,
    renderOptions: {
      bucketClient,
      templateKey: metadata.templateKey,
      templateConfig: metadata.templateConfig,
      tenantId,
      quotationId: quotation.id,
      versionKey: metadata.versionKey,
      _metricsContext: {
        fetchDataMs: null,
        resolveAssetsMs: null,
        htmlBuildMs: null,
        pdfRenderMs: null,
        totalMs: null,
      },
    },
  };
}

async function generateAndStoreArtifact({ tenantId, tenantSequelize, quotationId, artifactKey }) {
  const ctx = await buildPdfGenerationContext({ tenantId, tenantSequelize, quotationId });
  if (!ctx) {
    const err = new Error("Quotation not found for PDF generation");
    err.code = "QUOTATION_NOT_FOUND";
    throw err;
  }

  const pdfBuffer = await pdfService.generateQuotationPDF(ctx.pdfData, ctx.renderOptions);
  const bucketClient = ctx.renderOptions.bucketClient;
  await bucketService.uploadFile(
    {
      buffer: pdfBuffer,
      originalname: path.basename(artifactKey) || `quotation-${quotationId}.pdf`,
      mimetype: "application/pdf",
      size: pdfBuffer.length,
    },
    {
      customKey: artifactKey,
      acl: "private",
      contentType: "application/pdf",
    },
    bucketClient
  );

  return { ...ctx, artifactKey, size: pdfBuffer.length };
}

module.exports = {
  buildPdfGenerationContext,
  resolvePdfMetadataForQuotation,
  buildVersionKey,
  generateAndStoreArtifact,
  getBucketClientForTenant,
};

