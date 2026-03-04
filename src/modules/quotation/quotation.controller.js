"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const quotationService = require("./quotation.service.js");
const quotationTemplateService = require("./quotationTemplate.service.js");
const roleModuleService = require("../roleModule/roleModule.service.js");
const { getTeamHierarchyUserIds } = require("../../common/utils/teamHierarchyCache.js");
const { assertRecordVisibleByListingCriteria } = require("../../common/utils/listingCriteriaGuard.js");
const bucketService = require("../../common/services/bucket.service.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const pdfJobService = require("./pdfJob.service.js");
const pdfRunnerService = require("./pdfRunner.service.js");
const { buildArtifactKey } = require("./pdfArtifactKey.service.js");
const { resolvePdfMetadataForQuotation } = require("./quotationPdfArtifact.service.js");

const FILE_UNAVAILABLE_MESSAGE =
    "We couldn't save your documents right now. Please try again in a few minutes.";

const resolveQuotationVisibilityContext = async (req) => {
    const roleId = Number(req.user?.role_id);
    const userId = Number(req.user?.id);
    const listingCriteria = await roleModuleService.getListingCriteriaForRoleAndModule(
        {
            roleId,
            moduleRoute: "/quotation",
            moduleKey: "quotation",
        },
        req.transaction
    );

    if (listingCriteria !== "my_team") {
        return { listingCriteria, enforcedHandledByIds: null };
    }
    if (!Number.isInteger(userId) || userId <= 0) {
        return { listingCriteria, enforcedHandledByIds: [] };
    }
    const teamUserIds = await getTeamHierarchyUserIds(userId, {
        transaction: req.transaction,
    });
    return { listingCriteria, enforcedHandledByIds: teamUserIds };
};

const list = asyncHandler(async (req, res) => {
    const {
        q,
        inquiry_id,
        page = 1,
        limit = 20,
        sortBy = "id",
        sortOrder = "DESC",
        quotation_number,
        quotation_date_from,
        quotation_date_to,
        valid_till_from,
        valid_till_to,
        customer_name,
        mobile_number,
        project_capacity,
        project_capacity_op,
        project_capacity_to,
        total_project_value,
        total_project_value_op,
        total_project_value_to,
        is_approved,
        user_name,
        branch_name,
        state_name,
        order_type_name,
        project_scheme_name,
        inquiry_number,
        created_at_from,
        created_at_to,
        status,
        include_converted,
    } = req.query;
    const { enforcedHandledByIds } = await resolveQuotationVisibilityContext(req);
    const items = await quotationService.listQuotations({
        search: q,
        inquiry_id: inquiry_id ? parseInt(inquiry_id, 10) : undefined,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sortBy,
        sortOrder,
        quotation_number,
        quotation_date_from,
        quotation_date_to,
        valid_till_from,
        valid_till_to,
        customer_name,
        mobile_number,
        project_capacity,
        project_capacity_op,
        project_capacity_to,
        total_project_value,
        total_project_value_op,
        total_project_value_to,
        is_approved,
        user_name,
        branch_name,
        state_name,
        order_type_name,
        project_scheme_name,
        inquiry_number,
        created_at_from,
        created_at_to,
        status,
        include_converted: include_converted === "true" || include_converted === true,
        enforced_user_ids: enforcedHandledByIds,
    });
    return responseHandler.sendSuccess(res, items, "Quotation list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
    const {
        q,
        inquiry_id,
        quotation_number,
        quotation_date_from,
        quotation_date_to,
        valid_till_from,
        valid_till_to,
        customer_name,
        mobile_number,
        project_capacity,
        project_capacity_op,
        project_capacity_to,
        total_project_value,
        total_project_value_op,
        total_project_value_to,
        is_approved,
        user_name,
        branch_name,
        state_name,
        order_type_name,
        project_scheme_name,
        inquiry_number,
        created_at_from,
        created_at_to,
        status,
        include_converted,
    } = req.query;
    const { enforcedHandledByIds } = await resolveQuotationVisibilityContext(req);
    const buffer = await quotationService.exportQuotations({
        search: q,
        inquiry_id: inquiry_id ? parseInt(inquiry_id, 10) : undefined,
        quotation_number,
        quotation_date_from,
        quotation_date_to,
        valid_till_from,
        valid_till_to,
        customer_name,
        mobile_number,
        project_capacity,
        project_capacity_op,
        project_capacity_to,
        total_project_value,
        total_project_value_op,
        total_project_value_to,
        is_approved,
        user_name,
        branch_name,
        state_name,
        order_type_name,
        project_scheme_name,
        status,
        include_converted: include_converted === "true" || include_converted === true,
        inquiry_number,
        created_at_from,
        created_at_to,
        enforced_user_ids: enforcedHandledByIds,
    });
    const filename = `quotations-${new Date().toISOString().split("T")[0]}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await quotationService.getQuotationById({ id });
    if (!item) {
        return responseHandler.sendError(res, "Quotation not found", 404);
    }
    const context = await resolveQuotationVisibilityContext(req);
    assertRecordVisibleByListingCriteria(item, context, { handledByField: "user_id" });
    return responseHandler.sendSuccess(res, item, "Quotation fetched", 200);
});

const create = asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    const created = await quotationService.createQuotation({
        payload,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, created, "Quotation created", 201);
});

const update = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await quotationService.getQuotationById({ id });
    if (!existing) {
        return responseHandler.sendError(res, "Quotation not found", 404);
    }
    const context = await resolveQuotationVisibilityContext(req);
    assertRecordVisibleByListingCriteria(existing, context, { handledByField: "user_id" });
    const payload = { ...req.body };
    const updated = await quotationService.updateQuotation({
        id,
        payload,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, updated, "Quotation updated", 200);
});

const remove = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await quotationService.getQuotationById({ id });
    if (!existing) {
        return responseHandler.sendError(res, "Quotation not found", 404);
    }
    const context = await resolveQuotationVisibilityContext(req);
    assertRecordVisibleByListingCriteria(existing, context, { handledByField: "user_id" });
    const result = await quotationService.deleteQuotation({
        id,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, result, "Quotation deleted", 200);
});

const approve = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await quotationService.getQuotationById({ id });
    if (!existing) {
        return responseHandler.sendError(res, "Quotation not found", 404);
    }
    const context = await resolveQuotationVisibilityContext(req);
    assertRecordVisibleByListingCriteria(existing, context, { handledByField: "user_id" });
    const item = await quotationService.approveQuotation({
        id,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, item, "Quotation approved", 200);
});

const unapprove = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await quotationService.getQuotationById({ id });
    if (!existing) {
        return responseHandler.sendError(res, "Quotation not found", 404);
    }
    const context = await resolveQuotationVisibilityContext(req);
    assertRecordVisibleByListingCriteria(existing, context, { handledByField: "user_id" });
    const item = await quotationService.unapproveQuotation({
        id,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, item, "Quotation unapproved", 200);
});

const getProjectPrices = asyncHandler(async (req, res) => {
    const items = await quotationService.getProjectPrices({ schemeId: req.body.schemeId });
    return responseHandler.sendSuccess(res, items, "Project prices fetched", 200);
});

const getProjectPriceBomDetails = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const item = await quotationService.getProjectPriceBomDetails({ id });
    if (!item) {
        return responseHandler.sendError(res, "Project price not found", 404);
    }
    return responseHandler.sendSuccess(res, item, "Project price fetched", 200);
});

const getProductMakes = asyncHandler(async (req, res) => {
    const items = await quotationService.getProductMakes();
    if (!items) {
        return responseHandler.sendError(res, "Product makes not found", 404);
    } else {
        for (let index = 0; index < items.length; index++) {
            let element = items[index];
            element.productTypeName = element?.productType?.name?.toLowerCase() || "";
        }
        return responseHandler.sendSuccess(res, items, "Product makes fetched", 200);
    }
});

const getNextQuotationNumber = asyncHandler(async (req, res) => {
    const quotationNumber = await quotationService.getNextQuotationNumber();
    return responseHandler.sendSuccess(res, { quotation_number: quotationNumber }, "Next quotation number generated", 200);
});

const getAllProducts = asyncHandler(async (req, res) => {
    const items = await quotationService.getAllProducts();
    return responseHandler.sendSuccess(res, items, "Products fetched", 200);
});

const getQuotationCountByInquiry = asyncHandler(async (req, res) => {
    const { inquiry_id } = req.query;
    if (!inquiry_id) {
        return responseHandler.sendError(res, "inquiry_id is required", 400);
    }
    const count = await quotationService.getQuotationCountByInquiry({ inquiry_id: parseInt(inquiry_id, 10) });
    return responseHandler.sendSuccess(res, { count }, "Quotation count fetched", 200);
});

const listTemplates = asyncHandler(async (req, res) => {
    const items = await quotationTemplateService.listTemplates(req);
    return responseHandler.sendSuccess(res, items, "Quotation templates fetched", 200);
});

const getTemplateById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await quotationTemplateService.getTemplateById(id, req);
    if (!item) {
        return responseHandler.sendError(res, "Quotation template not found", 404);
    }
    return responseHandler.sendSuccess(res, item, "Quotation template fetched", 200);
});

const createTemplate = asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    if (!payload.name || !payload.template_key) {
        return responseHandler.sendError(res, "name and template_key are required", 400);
    }
    try {
        const created = await quotationTemplateService.createTemplate(payload, req);
        return responseHandler.sendSuccess(res, created, "Quotation template created", 201);
    } catch (err) {
        if (err.code === "TEMPLATE_FOLDER_NOT_FOUND") {
            return responseHandler.sendError(res, err.message, 400);
        }
        throw err;
    }
});

const updateTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await quotationTemplateService.getTemplateById(id, req);
    if (!existing) {
        return responseHandler.sendError(res, "Quotation template not found", 404);
    }
    const payload = { ...req.body };
    const updated = await quotationTemplateService.updateTemplate(id, payload, req);
    return responseHandler.sendSuccess(res, updated, "Quotation template updated", 200);
});

const updateTemplateConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await quotationTemplateService.getTemplateById(id, req);
    if (!existing) {
        return responseHandler.sendError(res, "Quotation template not found", 404);
    }
    const payload = { ...req.body };
    const updated = await quotationTemplateService.updateTemplateConfig(id, payload, req);
    return responseHandler.sendSuccess(res, updated, "Quotation template config updated", 200);
});

const uploadTemplateConfigImage = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const fieldName = req.body.fieldName || req.body.field_name || (req.file && req.file.fieldname) || "default_background";
    const file = req.file;
    if (!file) {
        return responseHandler.sendError(res, "No file uploaded", 400);
    }
    const existing = await quotationTemplateService.getTemplateById(id, req);
    if (!existing) {
        return responseHandler.sendError(res, "Quotation template not found", 404);
    }
    const result = await quotationTemplateService.uploadTemplateConfigImage(id, fieldName, file, req);
    return responseHandler.sendSuccess(res, result, "Image uploaded and config updated", 200);
});

const getPdfStatus = asyncHandler(async (req, res) => {
    const runner = pdfRunnerService.getRunnerStatus();
    let queue = null;
    try {
        const tenantModels = getTenantModels(req);
        queue = await pdfJobService.getQueueSummaryForModels(tenantModels);
    } catch (_) {
        queue = null;
    }
    return responseHandler.sendSuccess(
        res,
        {
            asyncMode: process.env.PDF_ASYNC_MODE !== "false",
            runner,
            tenant_id: req.tenant?.id || "default",
            queue,
            timing: buildPdfTimingMetadata(),
        },
        null,
        200
    );
});

const getTenantSequelizeForReq = (req) => {
    if (req?.tenant?.sequelize) return req.tenant.sequelize;
    return require("../../models/index.js").sequelize;
};

const sendArtifactResponse = async ({ req, res, artifactKey, filename }) => {
    const bucketClient = bucketService.getBucketForRequest(req);
    const mode = (process.env.PDF_ARTIFACT_MODE || "buffer").toLowerCase();
    const signedTtlSec = Math.max(60, parseInt(process.env.PDF_ARTIFACT_SIGNED_URL_TTL_SEC || "300", 10));
    if (mode === "signed_url") {
        const signedUrl = await bucketService.getSignedUrl(artifactKey, signedTtlSec, bucketClient);
        return res.redirect(302, signedUrl);
    }
    const object = await bucketService.getObjectWithClient(bucketClient, artifactKey);
    const pdfBuffer = Buffer.isBuffer(object.body) ? object.body : Buffer.from(object.body);
    res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": pdfBuffer.length,
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
    });
    return res.end(pdfBuffer);
};

const buildPdfTimingMetadata = (maxAttempts) => {
    const timing = pdfJobService.getJobTimingPolicy(maxAttempts);
    return {
        attempt_timeout_ms: timing.attempt_timeout_ms,
        max_attempts: timing.max_attempts,
        retry_budget_ms: timing.retry_budget_ms,
        recommended_poll_timeout_ms: timing.recommended_poll_timeout_ms,
    };
};

const ensurePdfJobForQuotation = async (req, quotation) => {
    const tenantId = req.tenant?.id || "default";
    const tenantSequelize = getTenantSequelizeForReq(req);
    const metadata = await resolvePdfMetadataForQuotation({ tenantSequelize, quotation });

    const artifactKey = buildArtifactKey({
        tenantId,
        quotationId: quotation.id,
        versionKey: metadata.versionKey,
    });

    const bucketClient = bucketService.getBucketForRequest(req);
    const artifactExists = await bucketService.fileExistsWithClient(bucketClient, artifactKey).catch(() => false);
    if (artifactExists) {
        console.info(
            `[PDF_JOB] artifact_hit tenant=${tenantId} quotation=${quotation.id} version=${metadata.versionKey}`
        );
        return {
            quotation,
            versionKey: metadata.versionKey,
            artifactKey,
            status: "completed",
            job: null,
        };
    }
    console.info(
        `[PDF_JOB] artifact_miss tenant=${tenantId} quotation=${quotation.id} version=${metadata.versionKey}`
    );

    const job = await pdfJobService.createOrGetJob(req, {
        tenantId,
        quotationId: quotation.id,
        versionKey: metadata.versionKey,
        artifactKey,
        payload: { quotation_id: quotation.id },
    });
    console.info(
        `[PDF_JOB] ${job._reused ? "job_reused" : "job_created"} tenant=${tenantId} quotation=${quotation.id} job=${job.id} status=${job.status}`
    );
    return {
        quotation,
        versionKey: metadata.versionKey,
        artifactKey,
        status: job.status,
        job,
    };
};

const createPdfJob = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const quotation = await quotationService.getQuotationForPdf({ id });
    if (!quotation) return responseHandler.sendError(res, "Quotation not found", 404);

    const context = await resolveQuotationVisibilityContext(req);
    assertRecordVisibleByListingCriteria(quotation, context, { handledByField: "user_id" });

    const jobState = await ensurePdfJobForQuotation(req, quotation);
    if (!jobState) return responseHandler.sendError(res, "Unable to prepare PDF job", 500);

    const payload = {
        status: jobState.status,
        job_id: jobState.job ? jobState.job.id : null,
        artifact_key: jobState.artifactKey,
        version_key: jobState.versionKey,
        timing: buildPdfTimingMetadata(jobState.job?.max_attempts),
    };
    return responseHandler.sendSuccess(res, payload, "PDF job prepared", jobState.status === "completed" ? 200 : 202);
});

const getPdfJobStatus = asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    // Force dynamic validator for this polling endpoint to avoid stale 304 loops.
    res.setHeader("ETag", `"pdf-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}"`);
    const { jobId } = req.params;
    const job = await pdfJobService.getJobById(req, jobId);
    if (!job) return responseHandler.sendError(res, "PDF job not found", 404);
    return responseHandler.sendSuccess(
        res,
        {
            id: job.id,
            status: job.status,
            attempts: job.attempts,
            max_attempts: job.max_attempts,
            error: job.last_error || null,
            artifact_key: job.artifact_key,
            can_download: job.status === "completed",
            download_path: `/api/quotation/pdf/jobs/${job.id}/download`,
            timing: buildPdfTimingMetadata(job.max_attempts),
        },
        "PDF job status fetched",
        200
    );
});

const downloadPdfJobArtifact = asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const job = await pdfJobService.getJobById(req, jobId);
    if (!job) return responseHandler.sendError(res, "PDF job not found", 404);
    if (job.status !== pdfJobService.JOB_STATUS.COMPLETED) {
        return responseHandler.sendError(res, "PDF job is not completed yet", 409);
    }
    const quotation = await quotationService.getQuotationForPdf({ id: job.quotation_id });
    const filename = `quotation-${quotation?.quotation_number || job.quotation_id}.pdf`;
    return sendArtifactResponse({ req, res, artifactKey: job.artifact_key, filename });
});

const generatePDF = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const quotation = await quotationService.getQuotationForPdf({ id });
    if (!quotation) return responseHandler.sendError(res, "Quotation not found", 404);

    const context = await resolveQuotationVisibilityContext(req);
    assertRecordVisibleByListingCriteria(quotation, context, { handledByField: "user_id" });

    const jobState = await ensurePdfJobForQuotation(req, quotation);
    if (!jobState) return responseHandler.sendError(res, "Unable to prepare PDF", 500);

    if (jobState.status === "completed") {
        const filename = `quotation-${quotation?.quotation_number || id}.pdf`;
        if (req.tenant?.id) {
            const usageService = require("../billing/usage.service.js");
            usageService.incrementPdfGenerated(req.tenant.id).catch(() => { });
        }
        return sendArtifactResponse({ req, res, artifactKey: jobState.artifactKey, filename });
    }

    const asyncMode = process.env.PDF_ASYNC_MODE !== "false";
    if (asyncMode) {
        return responseHandler.sendSuccess(
            res,
            {
                status: "processing",
                job_id: jobState.job?.id || null,
                artifact_key: jobState.artifactKey,
                poll_path: jobState.job ? `/api/quotation/pdf/jobs/${jobState.job.id}` : null,
                download_path: jobState.job ? `/api/quotation/pdf/jobs/${jobState.job.id}/download` : null,
            },
            "PDF generation started",
            202
        );
    }

    // Sync fallback when async mode is disabled: generate directly for this request.
    const tenantId = req.tenant?.id || "default";
    const tenantSequelize = getTenantSequelizeForReq(req);
    const { generateAndStoreArtifact } = require("./quotationPdfArtifact.service.js");
    await generateAndStoreArtifact({
        tenantId,
        tenantSequelize,
        quotationId: quotation.id,
        artifactKey: jobState.artifactKey,
    });
    const filename = `quotation-${quotation?.quotation_number || id}.pdf`;
    return sendArtifactResponse({ req, res, artifactKey: jobState.artifactKey, filename });
});

module.exports = {
    list,
    exportList,
    getById,
    create,
    update,
    remove,
    approve,
    unapprove,
    getProjectPrices,
    getProjectPriceBomDetails,
    getProductMakes,
    getNextQuotationNumber,
    getQuotationCountByInquiry,
    getAllProducts,
    listTemplates,
    getTemplateById,
    createTemplate,
    updateTemplate,
    updateTemplateConfig,
    uploadTemplateConfigImage,
    getPdfStatus,
    createPdfJob,
    getPdfJobStatus,
    downloadPdfJobArtifact,
    generatePDF
};

