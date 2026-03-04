"use strict";

const { Op } = require("sequelize");
const { getTenantModels } = require("../tenant/tenantModels.js");
const { getModelsForSequelize } = require("../tenant/tenantModels.js");

const JOB_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
};

const DEFAULT_MAX_ATTEMPTS = Math.max(1, parseInt(process.env.PDF_JOB_MAX_ATTEMPTS || "3", 10));
const PROCESSING_STALE_MS = Math.max(
  30_000,
  parseInt(process.env.PDF_JOB_PROCESSING_STALE_MS || "180000", 10)
);
const STALE_RECOVERY_BATCH = Math.max(
  1,
  parseInt(process.env.PDF_JOB_STALE_RECOVERY_BATCH || "20", 10)
);

function sanitizeJob(job) {
  if (!job) return null;
  const j = job.toJSON ? job.toJSON() : job;
  return {
    id: j.id,
    tenant_id: j.tenant_id,
    quotation_id: j.quotation_id,
    version_key: j.version_key,
    artifact_key: j.artifact_key,
    status: j.status,
    attempts: j.attempts,
    max_attempts: j.max_attempts,
    started_at: j.started_at,
    completed_at: j.completed_at,
    next_retry_at: j.next_retry_at,
    last_error: j.last_error,
    runner_id: j.runner_id,
    created_at: j.created_at,
    updated_at: j.updated_at,
  };
}

async function findReusableJob(QuotationPdfJob, { quotationId, versionKey }) {
  return QuotationPdfJob.findOne({
    where: {
      quotation_id: quotationId,
      version_key: versionKey,
      status: { [Op.in]: [JOB_STATUS.PENDING, JOB_STATUS.PROCESSING, JOB_STATUS.COMPLETED] },
    },
    order: [["id", "DESC"]],
  });
}

async function createOrGetJob(req, input) {
  const models = getTenantModels(req);
  return createOrGetJobForModels(models, input);
}

async function createOrGetJobForModels(models, input) {
  const { QuotationPdfJob } = models;
  const { tenantId, quotationId, versionKey, artifactKey, payload } = input;

  const existing = await findReusableJob(QuotationPdfJob, { quotationId, versionKey });
  if (existing) {
    return { ...sanitizeJob(existing), _reused: true };
  }

  const created = await QuotationPdfJob.create({
    tenant_id: tenantId != null ? String(tenantId) : null,
    quotation_id: quotationId,
    version_key: versionKey,
    artifact_key: artifactKey,
    status: JOB_STATUS.PENDING,
    attempts: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    payload: payload || null,
  });
  return { ...sanitizeJob(created), _reused: false };
}

async function getJobById(req, jobId) {
  const models = getTenantModels(req);
  const { QuotationPdfJob } = models;
  const found = await QuotationPdfJob.findByPk(jobId);
  return sanitizeJob(found);
}

async function getJobByIdForModels(models, jobId) {
  const { QuotationPdfJob } = models;
  const found = await QuotationPdfJob.findByPk(jobId);
  return sanitizeJob(found);
}

async function claimNextPendingJobForModels(models, { runnerId }) {
  const { QuotationPdfJob, sequelize } = models;
  const now = new Date();
  return sequelize.transaction(async (transaction) => {
    const job = await QuotationPdfJob.findOne({
      where: {
        status: JOB_STATUS.PENDING,
        [Op.or]: [{ next_retry_at: null }, { next_retry_at: { [Op.lte]: now } }],
      },
      order: [["created_at", "ASC"]],
      lock: true,
      skipLocked: true,
      transaction,
    });
    if (!job) return null;

    await job.update(
      {
        status: JOB_STATUS.PROCESSING,
        started_at: now,
        attempts: (job.attempts || 0) + 1,
        runner_id: runnerId || String(process.pid),
      },
      { transaction }
    );
    return sanitizeJob(job);
  });
}

async function markJobCompletedForModels(models, { jobId }) {
  const { QuotationPdfJob } = models;
  const job = await QuotationPdfJob.findByPk(jobId);
  if (!job) return null;
  await job.update({
    status: JOB_STATUS.COMPLETED,
    completed_at: new Date(),
    last_error: null,
    next_retry_at: null,
  });
  return sanitizeJob(job);
}

async function markJobFailedForModels(models, { jobId, errorMessage }) {
  const { QuotationPdfJob } = models;
  const job = await QuotationPdfJob.findByPk(jobId);
  if (!job) return null;

  const attempts = job.attempts || 0;
  const maxAttempts = job.max_attempts || DEFAULT_MAX_ATTEMPTS;
  const exhausted = attempts >= maxAttempts;
  const nextRetryAt = exhausted ? null : new Date(Date.now() + Math.min(60_000, 1000 * Math.pow(2, attempts)));

  await job.update({
    status: exhausted ? JOB_STATUS.FAILED : JOB_STATUS.PENDING,
    last_error: errorMessage ? String(errorMessage).slice(0, 4000) : null,
    next_retry_at: nextRetryAt,
    started_at: null,
    runner_id: null,
  });
  return sanitizeJob(job);
}

async function recoverStuckProcessingJobsForModels(models, { runnerId } = {}) {
  const { QuotationPdfJob } = models;
  const cutoff = new Date(Date.now() - PROCESSING_STALE_MS);
  const stuckJobs = await QuotationPdfJob.findAll({
    where: {
      status: JOB_STATUS.PROCESSING,
      started_at: { [Op.lte]: cutoff },
    },
    order: [["started_at", "ASC"]],
    limit: STALE_RECOVERY_BATCH,
  });

  let requeued = 0;
  let failed = 0;
  for (const job of stuckJobs) {
    const attempts = job.attempts || 0;
    const maxAttempts = job.max_attempts || DEFAULT_MAX_ATTEMPTS;
    const exhausted = attempts >= maxAttempts;
    const fallbackError = `Job exceeded processing window (${PROCESSING_STALE_MS}ms)`;
    const errorText = job.last_error
      ? `${String(job.last_error).slice(0, 3600)} | ${fallbackError}`
      : fallbackError;
    const nextRetryAt = exhausted ? null : new Date();
    await job.update({
      status: exhausted ? JOB_STATUS.FAILED : JOB_STATUS.PENDING,
      last_error: errorText.slice(0, 4000),
      next_retry_at: nextRetryAt,
      started_at: null,
      runner_id: runnerId || null,
    });
    if (exhausted) failed += 1;
    else requeued += 1;
  }

  return {
    scanned: stuckJobs.length,
    requeued,
    failed,
    processingStaleMs: PROCESSING_STALE_MS,
  };
}

function getModelsForTenantSequelize(sequelize) {
  return getModelsForSequelize(sequelize);
}

module.exports = {
  JOB_STATUS,
  createOrGetJob,
  createOrGetJobForModels,
  getJobById,
  getJobByIdForModels,
  claimNextPendingJobForModels,
  markJobCompletedForModels,
  markJobFailedForModels,
  recoverStuckProcessingJobsForModels,
  getModelsForTenantSequelize,
  sanitizeJob,
};

