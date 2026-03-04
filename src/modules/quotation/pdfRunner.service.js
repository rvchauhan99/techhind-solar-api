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

let _started = false;
let _timer = null;
let _activeChildren = 0;
let _lastTenantCache = { ts: 0, items: [] };

async function listTenantExecutors() {
  if (!dbPoolManager.isSharedMode()) {
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
  if (_activeChildren >= MAX_CONCURRENCY) return;

  const executors = await listTenantExecutors();
  for (const ex of executors) {
    if (_activeChildren >= MAX_CONCURRENCY) break;
    const models = getModelsForSequelize(ex.sequelize);
    if (!models || !models.QuotationPdfJob) continue;

    const job = await pdfJobService.claimNextPendingJobForModels(models, { runnerId: String(process.pid) });
    if (!job) continue;

    _activeChildren += 1;
    runJobInChild({ tenantId: ex.tenantId, jobId: job.id })
      .catch(async (err) => {
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
}

function startRunner() {
  if (!RUNNER_ENABLED || _started) return;
  _started = true;
  _timer = setInterval(() => {
    tickOnce().catch((err) => {
      console.error("[PDF_RUNNER] tick error:", err.message);
    });
  }, POLL_MS);
  console.info(`[PDF_RUNNER] started poll=${POLL_MS}ms maxConcurrency=${MAX_CONCURRENCY}`);
}

function stopRunner() {
  if (_timer) clearInterval(_timer);
  _timer = null;
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

