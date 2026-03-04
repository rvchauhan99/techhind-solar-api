"use strict";

const crypto = require("crypto");
const { Queue, QueueEvents } = require("bullmq");
const IORedis = require("ioredis");
const { processPdfJob } = require("./pdfJobProcessor.service.js");

const PDF_QUEUE_BACKEND = (process.env.PDF_QUEUE_BACKEND || "memory").toLowerCase(); // memory|redis
const PDF_QUEUE_NAME = process.env.PDF_QUEUE_NAME || "quotation-pdf";
const PDF_QUEUE_CANARY_TENANTS = (process.env.PDF_QUEUE_CANARY_TENANT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const PDF_QUEUE_JOB_TIMEOUT_MS = Math.max(5000, parseInt(process.env.PDF_QUEUE_JOB_TIMEOUT_MS || "120000", 10)); // 2 min default

const pending = [];
let activeCount = 0;

let _queue = null;
let _queueEvents = null;
let _redisConnection = null;

function isRedisBackend() {
    return PDF_QUEUE_BACKEND === "redis" && !!process.env.REDIS_URL;
}

function getRedisConnection() {
    if (!process.env.REDIS_URL) {
        throw new Error("REDIS_URL is required when PDF_QUEUE_BACKEND=redis");
    }
    if (_redisConnection) return _redisConnection;
    _redisConnection = new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
    });
    return _redisConnection;
}

function getQueue() {
    if (!isRedisBackend()) return null;
    if (_queue) return _queue;
    _queue = new Queue(PDF_QUEUE_NAME, { connection: getRedisConnection() });
    return _queue;
}

function getQueueEvents() {
    if (!isRedisBackend()) return null;
    if (_queueEvents) return _queueEvents;
    _queueEvents = new QueueEvents(PDF_QUEUE_NAME, { connection: getRedisConnection() });
    return _queueEvents;
}

function shouldUseRedisForTenant(tenantId) {
    if (!isRedisBackend()) return false;
    if (PDF_QUEUE_CANARY_TENANTS.length === 0) return true;
    if (tenantId == null) return false;
    return PDF_QUEUE_CANARY_TENANTS.includes(String(tenantId));
}

function processNext() {
    const memoryConcurrency = Math.max(1, parseInt(process.env.PDF_QUEUE_WORKER_CONCURRENCY || "1", 10));
    if (activeCount >= memoryConcurrency || pending.length === 0) return;
    const job = pending.shift();
    activeCount += 1;
    const { jobData, resolve, reject } = job;
    processPdfJob(jobData)
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

function enqueueInMemory(jobData) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const onceResolve = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            resolve(result);
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
            jobData,
            resolve: onceResolve,
            reject: onceReject,
        });
        processNext();
    });
}

/**
 * Enqueue a PDF generation job. Returns artifact metadata.
 * Uses Redis backend when enabled (and canary allows); otherwise in-memory.
 * @param {{ quotationData: object, renderOptions: object, artifactKey: string, tenantId: string|number }} jobData
 * @returns {Promise<{ artifactKey: string, size?: number }>}
 */
async function enqueuePdfJob(jobData) {
    const tenantId = jobData && jobData.tenantId;
    if (!shouldUseRedisForTenant(tenantId)) {
        return enqueueInMemory(jobData);
    }

    const queue = getQueue();
    const queueEvents = getQueueEvents();
    const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const job = await queue.add(
        "render-quotation-pdf",
        jobData,
        {
            jobId,
            removeOnComplete: 50,
            removeOnFail: 100,
            attempts: 2,
            backoff: { type: "exponential", delay: 1000 },
        }
    );
    const result = await job.waitUntilFinished(queueEvents, PDF_QUEUE_JOB_TIMEOUT_MS);
    return result || { artifactKey: jobData.artifactKey };
}

/**
 * Whether queue mode is available.
 * @returns {boolean}
 */
function isQueueEnabled() {
    return isRedisBackend() || PDF_QUEUE_BACKEND === "memory";
}

function getQueueBackend() {
    return isRedisBackend() ? "redis" : "memory";
}

/**
 * Current queue depth (pending + active). For metrics.
 * @returns {{ pending: number, active: number }}
 */
function getQueueDepth() {
    return { pending: pending.length, active: activeCount };
}

/**
 * Deterministic artifact key for rendered quotation PDFs.
 * @param {{ tenantId: string|number, quotationId: string|number, versionKey: string }} input
 * @returns {string}
 */
function buildArtifactKey(input) {
    const tenantId = input && input.tenantId != null ? String(input.tenantId) : "default";
    const quotationId = input && input.quotationId != null ? String(input.quotationId) : "unknown";
    const versionKey = input && input.versionKey ? String(input.versionKey) : "noversion";
    const digest = crypto.createHash("sha256").update(versionKey).digest("hex").slice(0, 24);
    return `quotation-pdf-artifacts/${tenantId}/${quotationId}/${digest}.pdf`;
}

module.exports = {
    enqueuePdfJob,
    isQueueEnabled,
    getQueueDepth,
    isRedisBackend,
    getQueueBackend,
    buildArtifactKey,
    PDF_QUEUE_NAME,
};
