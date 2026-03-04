"use strict";

require("dotenv").config();

const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const { processPdfJob } = require("../modules/quotation/pdfJobProcessor.service.js");
const { PDF_QUEUE_NAME, isRedisBackend } = require("../modules/quotation/pdfQueue.service.js");

if (!isRedisBackend()) {
    console.error("[PDF_WORKER] Configure PDF_QUEUE_BACKEND=redis and REDIS_URL.");
    process.exit(1);
}

const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
});
const concurrency = Math.max(1, parseInt(process.env.PDF_QUEUE_WORKER_CONCURRENCY || "1", 10));

const worker = new Worker(
    PDF_QUEUE_NAME,
    async (job) => {
        return processPdfJob(job.data);
    },
    {
        connection,
        concurrency,
    }
);

worker.on("ready", () => {
    console.info(`[PDF_WORKER] Ready. queue=${PDF_QUEUE_NAME} concurrency=${concurrency}`);
});

worker.on("completed", (job) => {
    console.info(`[PDF_WORKER] Completed job ${job.id}`);
});

worker.on("failed", (job, err) => {
    console.error(`[PDF_WORKER] Failed job ${job && job.id}:`, err && err.message ? err.message : err);
});

async function shutdown(signal) {
    console.info(`[PDF_WORKER] Shutting down on ${signal}...`);
    try {
        await worker.close();
    } finally {
        process.exit(0);
    }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

