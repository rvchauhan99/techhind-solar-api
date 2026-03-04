"use strict";

const path = require("path");
const { fork } = require("child_process");
const db = require("../../models/index.js");
const dbPoolManager = require("../tenant/dbPoolManager.js");
const tenantRegistryService = require("../tenant/tenantRegistry.service.js");
const pdfJobService = require("./pdfJob.service.js");
const { getModelsForSequelize } = require("../tenant/tenantModels.js");

const RUNNER_ENABLED = process.env.PDF_JOB_RUNNER_ENABLED !== "false";
const POLL_MS = Math.max(500, parseInt(process.env.PDF_JOB_RUNNER_POLL_MS || "1000", 10));
const MAX_CONCURRENCY = Math.max(1, parseInt(process.env.PDF_JOB_MAX_CONCURRENCY || "1", 10));
const CHILD_TIMEOUT_MS = Math.max(15_000, parseInt(process.env.PDF_CHILD_TIMEOUT_MS || "120000", 10));
const HEARTBEAT_MS = Math.max(5000, parseInt(process.env.PDF_JOB_RUNNER_HEARTBEAT_MS || "30000", 10));

let _started = false;
let _timer = null;
let _heartbeatTimer = null;
let _activeChildren = 0;
let _lastTenantCache = { ts: 0, items: [] };
let _tickInProgress = false;

// #region agent log
function debugLog(hypothesisId, location, message, data = {}) {
  fetch("http://127.0.0.1:7579/ingest/f5cb29de-5464-4f4d-96fc-7edaeea5c572", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "883c30",
    },
    body: JSON.stringify({
      sessionId: "883c30",
      runId: "pdf-debug-1",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

async function listTenantExecutors() {
  const t0 = Date.now();
  if (!dbPoolManager.isSharedMode()) {
    // #region agent log
    debugLog("H1", "pdfRunner.service.js:listTenantExecutors", "dedicated_mode_executor_resolved", {
      elapsedMs: Date.now() - t0,
      executors: 1,
    });
    // #endregion
    return [{ tenantId: "default", sequelize: db.sequelize }];
  }

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
  _lastTenantCache = { ts: now, items };
  // #region agent log
  debugLog("H1", "pdfRunner.service.js:listTenantExecutors", "shared_mode_executors_resolved", {
    elapsedMs: Date.now() - t0,
    executors: items.length,
  });
  // #endregion
  return items;
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
  if (_tickInProgress) return;
  _tickInProgress = true;
  try {
    if (_activeChildren >= MAX_CONCURRENCY) return;
    // #region agent log
    debugLog("H4", "pdfRunner.service.js:tickOnce", "tick_started", {
      activeChildren: _activeChildren,
      maxConcurrency: MAX_CONCURRENCY,
    });
    // #endregion
    const executors = await listTenantExecutors();
    for (const ex of executors) {
      if (_activeChildren >= MAX_CONCURRENCY) break;
      const models = getModelsForSequelize(ex.sequelize);
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

      const claimT0 = Date.now();
      const job = await pdfJobService.claimNextPendingJobForModels(models, { runnerId: String(process.pid) });
      // #region agent log
      debugLog("H1", "pdfRunner.service.js:tickOnce", "claim_attempt_result", {
        tenantId: ex.tenantId,
        elapsedMs: Date.now() - claimT0,
        claimed: Boolean(job),
        jobId: job ? job.id : null,
        jobStatus: job ? job.status : null,
      });
      // #endregion
      if (!job) continue;
      console.info(
        `[PDF_RUNNER] claimed job id=${job.id} tenant=${ex.tenantId} attempt=${job.attempts}/${job.max_attempts}`
      );

      _activeChildren += 1;
      const startedAt = Date.now();
      // #region agent log
      debugLog("H4", "pdfRunner.service.js:tickOnce", "child_spawned", {
        tenantId: ex.tenantId,
        jobId: job.id,
      });
      // #endregion
      runJobInChild({ tenantId: ex.tenantId, jobId: job.id })
        .then(() => {
          const elapsedMs = Date.now() - startedAt;
          // #region agent log
          debugLog("H4", "pdfRunner.service.js:tickOnce", "child_completed", {
            tenantId: ex.tenantId,
            jobId: job.id,
            elapsedMs,
          });
          // #endregion
          console.info(
            `[PDF_RUNNER] completed job id=${job.id} tenant=${ex.tenantId} elapsedMs=${elapsedMs}`
          );
        })
        .catch(async (err) => {
          const elapsedMs = Date.now() - startedAt;
          // #region agent log
          debugLog("H4", "pdfRunner.service.js:tickOnce", "child_failed", {
            tenantId: ex.tenantId,
            jobId: job.id,
            elapsedMs,
            error: err.message,
          });
          // #endregion
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

