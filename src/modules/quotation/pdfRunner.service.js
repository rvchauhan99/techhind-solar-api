"use strict";

const path = require("path");
const { fork } = require("child_process");
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
const RECOVERY_INTERVAL_MS = Math.max(10_000, parseInt(process.env.PDF_JOB_RECOVERY_INTERVAL_MS || "15000", 10));
const USE_PERSISTENT_WORKER = process.env.PDF_JOB_USE_PERSISTENT_WORKER !== "false";
const WORKER_RESTART_MS = Math.max(5000, parseInt(process.env.PDF_WORKER_RESTART_DELAY_MS || "10000", 10));

let _started = false;
let _timer = null;
let _heartbeatTimer = null;
let _activeChildren = 0;
const _activeChildProcs = new Set();
let _worker = null;
let _workerReady = false;
let _workerRestartTimeout = null;
let _lastTenantCache = { ts: 0, items: [] };
let _tickInProgress = false;
let _lastCleanupAt = 0;
let _tenantCursor = 0;
let _lastRecoveryAtPerTenant = {};
let _cleanupTenantIndex = 0;

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
    // Registry or tenant list failed; do not fall back to main DB (it may be registry and lack quotation_pdf_jobs).
  }

  return [];
}

function spawnWorker() {
  if (_worker) return;
  const workerPath = path.join(__dirname, "pdfWorker.entry.js");
  _worker = fork(workerPath, [], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });
  _workerReady = false;

  _worker.on("message", (msg) => {
    if (msg && msg.type === "ready") {
      _workerReady = true;
      console.info("[PDF_RUNNER] persistent worker ready");
    }
    if (msg && msg.type === "done") {
      _activeChildren -= 1;
      const elapsed = msg.errorMessage ? " failed" : " completed";
      console.info(
        `[PDF_RUNNER] job id=${msg.jobId} tenant=${msg.tenantId}${elapsed}` +
          (msg.errorMessage ? ` error=${msg.errorMessage}` : "")
      );
    }
  });

  _worker.on("exit", (code, signal) => {
    _worker = null;
    _workerReady = false;
    console.warn(`[PDF_RUNNER] persistent worker exited code=${code} signal=${signal}`);
    if (_started && USE_PERSISTENT_WORKER) {
      _workerRestartTimeout = setTimeout(() => {
        _workerRestartTimeout = null;
        spawnWorker();
      }, WORKER_RESTART_MS);
    }
  });

  _worker.on("error", (err) => {
    console.error("[PDF_RUNNER] persistent worker error:", err.message);
  });
}

function runJobInChild({ tenantId, jobId }) {
  return new Promise((resolve, reject) => {
    const childPath = path.join(__dirname, "pdfChild.entry.js");
    const child = fork(childPath, [`--tenantId=${tenantId}`, `--jobId=${jobId}`], {
      stdio: "inherit",
    });

    _activeChildProcs.add(child);

    const timeoutId = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch (_) {
        // ignore
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch (_) {
          // ignore
        }
      }, 5000);
      reject(new Error(`Child timeout after ${CHILD_TIMEOUT_MS}ms`));
    }, CHILD_TIMEOUT_MS);

    child.on("exit", (code) => {
      clearTimeout(timeoutId);
      _activeChildProcs.delete(child);
      if (code === 0) resolve();
      else reject(new Error(`Child exited with code ${code}`));
    });
    child.on("error", (err) => {
      clearTimeout(timeoutId);
      _activeChildProcs.delete(child);
      reject(err);
    });
  });
}

function runJob({ tenantId, jobId, ex, job }) {
  const startedAt = Date.now();
  if (USE_PERSISTENT_WORKER && _worker && _workerReady) {
    _activeChildren += 1;
    _worker.send({ type: "job", tenantId, jobId });
    return;
  }
  runJobInChild({ tenantId, jobId })
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
        const models = getModelsForSequelize(ex.sequelize);
        if (models) {
          await pdfJobService.markJobFailedForModels(models, { jobId: job.id, errorMessage: err.message });
        }
      } catch (_) {
        // ignore secondary failure
      }
    })
    .finally(() => {
      _activeChildren -= 1;
    });
}

async function tickOnce() {
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
      if (!models || !models.QuotationPdfJob) continue;

      const nowMs = Date.now();
      const lastRecovery = _lastRecoveryAtPerTenant[ex.tenantId] || 0;
      if (nowMs - lastRecovery >= RECOVERY_INTERVAL_MS) {
        try {
          _lastRecoveryAtPerTenant[ex.tenantId] = nowMs;
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
      }

      const cleanupDue = nowMs - _lastCleanupAt >= CLEANUP_EVERY_MS;
      const executorIndex = executors.findIndex((e) => e.tenantId === ex.tenantId);
      const isCleanupTenantThisTick =
        cleanupDue && executorIndex === (_cleanupTenantIndex % Math.max(1, executors.length));
      if (isCleanupTenantThisTick) {
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
          _lastCleanupAt = nowMs;
          _cleanupTenantIndex += 1;
        }
      }

      const job = await pdfJobService.claimNextPendingJobForModels(models, { runnerId: String(process.pid) });
      if (!job) continue;
      console.info(
        `[PDF_RUNNER] claimed job id=${job.id} tenant=${ex.tenantId} attempt=${job.attempts}/${job.max_attempts}`
      );

      runJob({ tenantId: ex.tenantId, jobId: job.id, ex, job });
    }
  } finally {
    _tickInProgress = false;
  }
}

function startRunner() {
  if (!RUNNER_ENABLED || _started) return;
  _started = true;
  if (USE_PERSISTENT_WORKER) {
    spawnWorker();
  }
  _timer = setInterval(() => {
    tickOnce().catch((err) => {
      console.error("[PDF_RUNNER] tick error:", err.message);
    });
  }, POLL_MS);
  _heartbeatTimer = setInterval(() => {
    console.info(
      `[PDF_RUNNER] heartbeat started=${_started} activeChildren=${_activeChildren} pollMs=${POLL_MS} maxConcurrency=${MAX_CONCURRENCY} worker=${USE_PERSISTENT_WORKER ? (_workerReady ? "ready" : "starting") : "off"}`
    );
  }, HEARTBEAT_MS);
  console.info(
    `[PDF_RUNNER] started poll=${POLL_MS}ms maxConcurrency=${MAX_CONCURRENCY} childTimeoutMs=${CHILD_TIMEOUT_MS} heartbeatMs=${HEARTBEAT_MS} persistentWorker=${USE_PERSISTENT_WORKER}`
  );
}

function stopRunner() {
  if (_timer) clearInterval(_timer);
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  if (_workerRestartTimeout) {
    clearTimeout(_workerRestartTimeout);
    _workerRestartTimeout = null;
  }
  if (_worker) {
    try {
      _worker.kill("SIGTERM");
    } catch (_) {
      // ignore
    }
    _worker = null;
    _workerReady = false;
  }
  _timer = null;
  _heartbeatTimer = null;
  for (const child of _activeChildProcs) {
    try {
      child.kill("SIGTERM");
    } catch (_) {
      // ignore
    }
  }
  _started = false;
}

function getRunnerStatus() {
  return {
    enabled: RUNNER_ENABLED,
    started: _started,
    pollMs: POLL_MS,
    maxConcurrency: MAX_CONCURRENCY,
    activeChildren: _activeChildren,
    persistentWorker: USE_PERSISTENT_WORKER,
    workerReady: _workerReady,
  };
}

module.exports = {
  startRunner,
  stopRunner,
  getRunnerStatus,
};

