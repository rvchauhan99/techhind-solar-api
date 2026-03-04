"use strict";

const path = require("path");
const { fork } = require("child_process");
const db = require("../../models/index.js");
const dbPoolManager = require("../tenant/dbPoolManager.js");
const tenantRegistryService = require("../tenant/tenantRegistry.service.js");
const { initializeRegistryConnection, isRegistryAvailable } = require("../../config/registryDb.js");
const pdfJobService = require("./pdfJob.service.js");
const { getModelsForSequelize } = require("../tenant/tenantModels.js");

const RUNNER_ENABLED = process.env.PDF_JOB_RUNNER_ENABLED !== "false";
const POLL_MS = Math.max(500, parseInt(process.env.PDF_JOB_RUNNER_POLL_MS || "1000", 10));
const MAX_CONCURRENCY = Math.max(1, parseInt(process.env.PDF_JOB_MAX_CONCURRENCY || "1", 10));
const CHILD_TIMEOUT_MS = Math.max(15_000, parseInt(process.env.PDF_CHILD_TIMEOUT_MS || "120000", 10));
const HEARTBEAT_MS = Math.max(5000, parseInt(process.env.PDF_JOB_RUNNER_HEARTBEAT_MS || "30000", 10));
const CLEANUP_EVERY_MS = Math.max(60_000, parseInt(process.env.PDF_JOB_CLEANUP_INTERVAL_MS || "900000", 10));

let _started = false;
let _timer = null;
let _heartbeatTimer = null;
let _activeChildren = 0;
let _lastTenantCache = { ts: 0, items: [] };
let _tickInProgress = false;
let _lastCleanupAt = 0;
let _tenantCursor = 0;

async function listTenantExecutors() {
  // Independent/dedicated mode: no registry URL → single executor for the app DB (DATABASE_URL / DB_*).
  if (!process.env.TENANT_REGISTRY_DB_URL) {
    const seq = await dbPoolManager.getPool("default");
    return [{ tenantId: "default", sequelize: seq }];
  }

  // Multi-tenant mode: registry URL set → poll all tenant DBs so runner sees jobs the API wrote.
  try {
    if (!isRegistryAvailable()) await initializeRegistryConnection();
    const now = Date.now();
    if (now - _lastTenantCache.ts < 10_000 && _lastTenantCache.items.length > 0) {
      return _lastTenantCache.items;
    }
    const tenants = await tenantRegistryService.getActiveTenantsForMigrations({ sharedOnly: false });
    const items = [];
    for (const t of tenants) {
      try {
        const sequelize = await dbPoolManager.getPool(t.id);
        items.push({ tenantId: t.id, sequelize });
      } catch (err) {
        // Ignore one-tenant failure and continue polling others.
      }
    }
    if (items.length > 0) {
      _lastTenantCache = { ts: now, items };
      return items;
    }
  } catch (err) {
    // Registry or tenant list failed; fall back to default DB below.
  }

  // Fallback: registry set but returned no tenants or failed. Use main app DB.
  const seq = dbPoolManager.isSharedMode() ? db.sequelize : await dbPoolManager.getPool("default");
  return [{ tenantId: "default", sequelize: seq }];
}

function runJobInChild({ tenantId, jobId }) {
  return new Promise((resolve, reject) => {
    const childPath = path.join(__dirname, "pdfChild.entry.js");
    const child = fork(childPath, [`--tenantId=${tenantId}`, `--jobId=${jobId}`], {
      stdio: "inherit",
    });

    const timeoutId = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch (_) {
        // ignore
      }
      reject(new Error(`Child timeout after ${CHILD_TIMEOUT_MS}ms`));
    }, CHILD_TIMEOUT_MS);

    child.on("exit", (code) => {
      clearTimeout(timeoutId);
      if (code === 0) resolve();
      else reject(new Error(`Child exited with code ${code}`));
    });
    child.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

async function tickOnce() {
  // #region agent log
  if (Date.now() % 5000 < 1100) {
    fetch("http://127.0.0.1:7579/ingest/f5cb29de-5464-4f4d-96fc-7edaeea5c572", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "883c30" },
      body: JSON.stringify({
        sessionId: "883c30",
        hypothesisId: "H3",
        location: "pdfRunner.service.js:tickOnce:entry",
        message: "tickOnce entry",
        data: { _tickInProgress, _activeChildren, MAX_CONCURRENCY },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  if (_tickInProgress) return;
  _tickInProgress = true;
  try {
    if (_activeChildren >= MAX_CONCURRENCY) return;
    const executors = await listTenantExecutors();
    const fairExecutors = executors.length
      ? executors
          .slice(_tenantCursor % executors.length)
          .concat(executors.slice(0, _tenantCursor % executors.length))
      : executors;
    if (executors.length > 0) {
      _tenantCursor = (_tenantCursor + 1) % executors.length;
    }
    for (const ex of fairExecutors) {
      if (_activeChildren >= MAX_CONCURRENCY) break;
      const models = getModelsForSequelize(ex.sequelize);
      // #region agent log
      if (Date.now() % 5000 < 1100) {
        fetch("http://127.0.0.1:7579/ingest/f5cb29de-5464-4f4d-96fc-7edaeea5c572", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "883c30" },
          body: JSON.stringify({
            sessionId: "883c30",
            hypothesisId: "H5",
            location: "pdfRunner.service.js:tickOnce:models",
            message: "models for executor",
            data: {
              tenantId: ex.tenantId,
              hasModels: !!models,
              hasQuotationPdfJob: !!(models && models.QuotationPdfJob),
              dbName: ex.sequelize?.config?.database,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      }
      // #endregion
      if (!models || !models.QuotationPdfJob) continue;

      try {
        const recovered = await pdfJobService.recoverStuckProcessingJobsForModels(models, {
          runnerId: String(process.pid),
        });
        if (recovered.scanned > 0) {
          console.warn(
            `[PDF_RUNNER] recovered stuck jobs tenant=${ex.tenantId} scanned=${recovered.scanned} requeued=${recovered.requeued} failed=${recovered.failed} staleMs=${recovered.processingStaleMs}`
          );
        }
      } catch (recoveryErr) {
        console.error(
          `[PDF_RUNNER] stuck-job recovery failed tenant=${ex.tenantId}: ${recoveryErr.message}`
        );
      }
      if (Date.now() - _lastCleanupAt >= CLEANUP_EVERY_MS) {
        try {
          const cleanup = await pdfJobService.cleanupOldJobsForModels(models);
          if ((cleanup.failedDeleted || 0) > 0 || (cleanup.completedDeleted || 0) > 0) {
            console.info(
              `[PDF_RUNNER] cleanup tenant=${ex.tenantId} failedDeleted=${cleanup.failedDeleted} completedDeleted=${cleanup.completedDeleted}`
            );
          }
        } catch (cleanupErr) {
          console.error(`[PDF_RUNNER] cleanup failed tenant=${ex.tenantId}: ${cleanupErr.message}`);
        } finally {
          _lastCleanupAt = Date.now();
        }
      }

      const job = await pdfJobService.claimNextPendingJobForModels(models, { runnerId: String(process.pid) });
      // #region agent log
      fetch("http://127.0.0.1:7579/ingest/f5cb29de-5464-4f4d-96fc-7edaeea5c572", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "883c30" },
        body: JSON.stringify({
          sessionId: "883c30",
          hypothesisId: "H2",
          location: "pdfRunner.service.js:tickOnce:afterClaim",
          message: "claim result",
          data: { tenantId: ex.tenantId, jobId: job ? job.id : null, hasJob: !!job },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (!job) continue;
      console.info(
        `[PDF_RUNNER] claimed job id=${job.id} tenant=${ex.tenantId} attempt=${job.attempts}/${job.max_attempts}`
      );

      _activeChildren += 1;
      const startedAt = Date.now();
      runJobInChild({ tenantId: ex.tenantId, jobId: job.id })
        .then(() => {
          const elapsedMs = Date.now() - startedAt;
          console.info(
            `[PDF_RUNNER] completed job id=${job.id} tenant=${ex.tenantId} elapsedMs=${elapsedMs}`
          );
        })
        .catch(async (err) => {
          const elapsedMs = Date.now() - startedAt;
          console.warn(
            `[PDF_RUNNER] failed job id=${job.id} tenant=${ex.tenantId} elapsedMs=${elapsedMs} error=${err.message}`
          );
          try {
            await pdfJobService.markJobFailedForModels(models, { jobId: job.id, errorMessage: err.message });
          } catch (_) {
            // ignore secondary failure
          }
        })
        .finally(() => {
          _activeChildren -= 1;
        });
    }
  } finally {
    _tickInProgress = false;
  }
}

function startRunner() {
  if (!RUNNER_ENABLED || _started) return;
  _started = true;
  _timer = setInterval(() => {
    tickOnce().catch((err) => {
      console.error("[PDF_RUNNER] tick error:", err.message);
    });
  }, POLL_MS);
  _heartbeatTimer = setInterval(() => {
    console.info(
      `[PDF_RUNNER] heartbeat started=${_started} activeChildren=${_activeChildren} pollMs=${POLL_MS} maxConcurrency=${MAX_CONCURRENCY}`
    );
  }, HEARTBEAT_MS);
  console.info(
    `[PDF_RUNNER] started poll=${POLL_MS}ms maxConcurrency=${MAX_CONCURRENCY} childTimeoutMs=${CHILD_TIMEOUT_MS} heartbeatMs=${HEARTBEAT_MS}`
  );
}

function stopRunner() {
  if (_timer) clearInterval(_timer);
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  _timer = null;
  _heartbeatTimer = null;
  _started = false;
}

function getRunnerStatus() {
  return {
    enabled: RUNNER_ENABLED,
    started: _started,
    pollMs: POLL_MS,
    maxConcurrency: MAX_CONCURRENCY,
    activeChildren: _activeChildren,
  };
}

module.exports = {
  startRunner,
  stopRunner,
  getRunnerStatus,
};

