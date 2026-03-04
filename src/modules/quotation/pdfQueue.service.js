"use strict";

const pdfService = require("./pdf.service.js");

const QUEUE_ENABLED = process.env.PDF_QUEUE_ENABLED === "true";
const PDF_QUEUE_WORKER_CONCURRENCY = Math.max(1, parseInt(process.env.PDF_QUEUE_WORKER_CONCURRENCY || "1", 10));
const PDF_QUEUE_JOB_TIMEOUT_MS = Math.max(5000, parseInt(process.env.PDF_QUEUE_JOB_TIMEOUT_MS || "120000", 10)); // 2 min default

const pending = [];
let activeCount = 0;

function processNext() {
    if (activeCount >= PDF_QUEUE_WORKER_CONCURRENCY || pending.length === 0) return;
    const job = pending.shift();
    activeCount += 1;
    const { pdfData, options, resolve, reject } = job;
    pdfService
        .generateQuotationPDF(pdfData, options)
        .then((buffer) => {
            resolve(buffer);
        })
        .catch((err) => {
            reject(err);
        })
        .finally(() => {
            activeCount -= 1;
            processNext();
        });
}

/**
 * Enqueue a PDF generation job and return a Promise that resolves with the PDF buffer.
 * When QUEUE_ENABLED is false, this still works by running the job immediately (same as inline).
 * @param {Object} pdfData - Prepared quotation data for PDF
 * @param {Object} options - Options for generateQuotationPDF (bucketClient, templateKey, templateConfig, tenantId, quotationId, versionKey, etc.)
 * @returns {Promise<Buffer>} PDF buffer
 */
function enqueuePdfJob(pdfData, options) {
    if (!QUEUE_ENABLED) {
        return pdfService.generateQuotationPDF(pdfData, options);
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        const onceResolve = (buffer) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            resolve(buffer);
        };
        const onceReject = (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            reject(err);
        };
        const timeoutId = setTimeout(() => {
            onceReject(new Error(`PDF job timeout after ${PDF_QUEUE_JOB_TIMEOUT_MS}ms`));
        }, PDF_QUEUE_JOB_TIMEOUT_MS);
        pending.push({
            pdfData,
            options,
            resolve: onceResolve,
            reject: onceReject,
        });
        processNext();
    });
}

/**
 * Whether the queue path is enabled (env PDF_QUEUE_ENABLED=true).
 * @returns {boolean}
 */
function isQueueEnabled() {
    return QUEUE_ENABLED;
}

/**
 * Current queue depth (pending + active). For metrics.
 * @returns {{ pending: number, active: number }}
 */
function getQueueDepth() {
    return { pending: pending.length, active: activeCount };
}

module.exports = {
    enqueuePdfJob,
    isQueueEnabled,
    getQueueDepth,
};
