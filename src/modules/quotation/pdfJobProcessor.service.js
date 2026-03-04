"use strict";

const path = require("path");
const pdfService = require("./pdf.service.js");
const bucketService = require("../../common/services/bucket.service.js");
const bucketClientFactory = require("../tenant/bucketClientFactory.js");

/**
 * Resolve bucket client for tenant. In dedicated mode this returns default env bucket.
 * @param {string|number} tenantId
 * @returns {Promise<{ s3: object, bucketName: string }>}
 */
async function getBucketClientForTenant(tenantId) {
    if (tenantId == null || tenantId === "" || tenantId === "default") {
        return bucketService.getClient();
    }
    return bucketClientFactory.getBucketClient(String(tenantId));
}

/**
 * Process one PDF generation job and persist the artifact to object storage.
 * @param {{ quotationData: object, renderOptions: object, artifactKey: string, tenantId: string|number }} jobData
 * @returns {Promise<{ artifactKey: string, size: number }>}
 */
async function processPdfJob(jobData) {
    const { quotationData, renderOptions = {}, artifactKey, tenantId } = jobData || {};
    if (!quotationData) throw new Error("quotationData is required");
    if (!artifactKey) throw new Error("artifactKey is required");

    const bucketClient = await getBucketClientForTenant(tenantId);
    const pdfBuffer = await pdfService.generateQuotationPDF(quotationData, {
        ...renderOptions,
        bucketClient,
    });

    const originalname = path.basename(artifactKey) || `quotation-${Date.now()}.pdf`;
    await bucketService.uploadFile(
        {
            buffer: pdfBuffer,
            originalname,
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

    return { artifactKey, size: pdfBuffer.length };
}

module.exports = {
    processPdfJob,
};

