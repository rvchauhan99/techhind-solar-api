"use strict";

const { fork } = require("child_process");
const path = require("path");
const { getTenantModels } = require("../../tenant/tenantModels.js");
const bucketService = require("../../../common/services/bucket.service.js");
const bucketClientFactory = require("../../tenant/bucketClientFactory.js");

const asyncHandler = require("express-async-handler");
const { Op } = require("sequelize");
const responseHandler = require("../../../common/utils/responseHandler.js");

const getSampleHeaders = () => {
  // Keep this aligned with what `orderImportEngine` needs.
  return [
    "order_number",
    "current_stage_key",
    "order_date",
    "inquiry_source_name",
    "inquiry_by_email",
    "handled_by_email",
    "channel_partner_email",
    "branch_name",
    "project_scheme_name",
    "order_type_name",
    "discom_name",
    "state_name",
    "city_name",
    "division_name",
    "sub_division_name",
    "planned_warehouse_name",
    "fabricator_installer_email",
    "solar_panel",
    "inverter",
    "mobile_number",
    "customer_name",
    "address",
    "pin_code",
    "company_name",
    "phone_no",
    "email_id",
    "landmark_area",
    "taluka",
    "district",
    "capacity",
    "project_cost",
    "discount",
    "consumer_no",
    "circle",
    "reference_from",
    "application_no",
    "registration_date",
    "payment_type",

    // Stage fields (estimate -> subsidy_disbursed)
    "estimate_amount",
    "estimate_due_date",
    "estimate_paid_at",
    "estimate_paid_by",
    "zero_amount_estimate",
    "estimate_completed_at",
    "planned_delivery_date",
    "planned_priority",
    "planner_completed_at",
    "planned_solar_panel_qty",
    "planned_inverter_qty",
    "fabricator_installer_are_same",
    "fabrication_due_date",
    "installation_due_date",
    "fabrication_completed_at",
    "installation_completed_at",
    "assign_fabricator_installer_completed_at",
    "netmeter_applied",
    "netmeter_applied_on",
    "netmeter_installed",
    "netmeter_installed_on",
    "netmeter_apply_completed_at",
    "netmeter_installed_completed_at",
    "subsidy_claim",
    "claim_date",
    "claim_amount",
    "subsidy_claim_completed_at",
    "subsidy_disbursed",
    "disbursed_date",
    "disbursed_amount",
    "subsidy_disbursed_completed_at",
    "order_remarks",
  ];
};

const csvEscape = (s) => {
  const v = s == null ? "" : String(s);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
};

const getSampleCsvText = () => {
  const headers = getSampleHeaders();
  return `${headers.map(csvEscape).join(",")}\n`;
};

const getJobResultPayload = (job) => {
  // We always store { totalRows, results, summary } in result_json.
  const resultJson = job?.result_json || null;
  return resultJson || { totalRows: 0, results: [], summary: null };
};

const parseBoolean = (v) => {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return false;
  return ["1", "true", "yes", "on"].includes(s);
};

const getTenantBucketClient = async (req) => {
  // Prefer the tenant-scoped bucket already attached by tenantContextMiddleware.
  if (req?.tenant?.bucket) return req.tenant.bucket;
  if (req?.tenant?.id) {
    return bucketClientFactory.getBucketClient(String(req.tenant.id));
  }
  return bucketService.getClient();
};

const getJobRowResultsOrEmpty = (job) => {
  const resultJson = job?.result_json || {};
  return Array.isArray(resultJson?.results) ? resultJson.results : [];
};

const getSampleCsv = asyncHandler(async (req, res) => {
  const text = getSampleCsvText();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="order-import-sample.csv"`);
  res.status(200).send(text);
});

const uploadImportCsv = asyncHandler(async (req, res) => {
  const models = getTenantModels(req);
  const { OrderImportJob } = models;

  if (!req.file?.buffer) {
    return res.status(400).json({ status: "error", message: "CSV file is required (field: file)" });
  }

  let dryRun = parseBoolean(req.body?.dry_run);
  let skipExisting = parseBoolean(req.body?.skip_existing);
  let updateExisting = parseBoolean(req.body?.update_existing);

  // Enforce mutual exclusivity / safe defaults:
  if (updateExisting) skipExisting = false;
  if (!skipExisting && !updateExisting) skipExisting = true;

  const tenantId = req.tenant?.id ?? null;
  const userId = req.user?.id ?? null;

  const job = await OrderImportJob.create({
    tenant_id: tenantId,
    status: "pending",
    options: { dryRun, skipExisting, updateExisting },
    started_at: null,
    attempts: 0,
    max_attempts: 2,
    created_by: userId,
    updated_by: userId,
  });

  try {
    const bucketClient = await getTenantBucketClient(req);
    const inputFilename = `order-import-input-${job.id}.csv`;
    const inputUpload = await bucketService.uploadFile(
      {
        buffer: req.file.buffer,
        originalname: inputFilename,
        mimetype: "text/csv; charset=utf-8",
        size: req.file.size ?? req.file.buffer?.length ?? 0,
      },
      { prefix: `order-import-inputs/${tenantId || "default"}` },
      bucketClient
    );

    await job.update({
      status: "pending",
      input_csv_key: inputUpload?.path || null,
      last_error: null,
      updated_by: userId,
    });

    // Fire-and-forget: child process will update job status to processing/completed/failed.
    const childPath = path.join(__dirname, "../../../workers/orderImportJobChild.entry.js");
    try {
      const child = fork(
        childPath,
        [`--tenantId=${tenantId || "default"}`, `--jobId=${job.id}`],
        { stdio: "inherit" }
      );
      child.unref();
    } catch (childErr) {
      // If forking fails, mark job failed so UI sees an error quickly.
      await job.update({
        status: "failed",
        last_error: childErr?.message || String(childErr),
        completed_at: new Date(),
        updated_by: userId,
      });
    }

    return res.status(200).json({
      status: "ok",
      jobId: job.id,
      pollPath: `/order/import/jobs/${job.id}`,
      resultsPath: `/order/import/jobs/${job.id}/results`,
      downloadPath: `/order/import/jobs/${job.id}/download`,
    });
  } catch (err) {
    await job.update({
      status: "failed",
      last_error: err?.message || String(err),
      completed_at: new Date(),
      updated_by: req.user?.id ?? null,
    });

    return res.status(500).json({
      status: "error",
      jobId: job.id,
      message: err?.message || String(err),
    });
  }
});

const listJobs = asyncHandler(async (req, res) => {
  const models = getTenantModels(req);
  const { OrderImportJob, User } = models;

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 100));
  const status = typeof req.query.status === "string" ? req.query.status.trim() : undefined;

  const sortByCandidate = typeof req.query.sortBy === "string" ? req.query.sortBy.trim() : "";
  const sortBy = ["created_at", "id", "status"].includes(sortByCandidate) ? sortByCandidate : "created_at";
  const sortOrder = req.query.sortOrder === "asc" ? "asc" : "DESC";

  const where = {};
  if (status) where.status = status;

  const offset = (page - 1) * limit;
  const { count, rows } = await OrderImportJob.findAndCountAll({
    where,
    limit,
    offset,
    attributes: ["id", "status", "options", "created_at", "completed_at", "created_by"],
    order: [[sortBy, sortOrder]],
  });

  const createdByIds = [...new Set(rows.map((r) => r?.created_by).filter(Boolean))];
  const userNameById = new Map();

  if (createdByIds.length) {
    const users = await User.findAll({
      where: { id: { [Op.in]: createdByIds } },
      attributes: ["id", "name"],
      raw: true,
    });
    users.forEach((u) => userNameById.set(Number(u.id), u.name));
  }

  const data = rows.map((job) => {
    const j = job.toJSON ? job.toJSON() : job;
    const options = j.options || {};
    const createdByName = userNameById.get(Number(j.created_by)) || null;

    return {
      id: j.id,
      created_at: j.created_at,
      completed_at: j.completed_at ?? null,
      status: j.status,
      created_by: j.created_by ?? null,
      created_by_name: createdByName,
      dryRun: options?.dryRun ?? null,
      skipExisting: options?.skipExisting ?? null,
      updateExisting: options?.updateExisting ?? null,
    };
  });

  return responseHandler.sendSuccess(
    res,
    { data, meta: { page, limit, total: count, pages: limit > 0 ? Math.ceil(count / limit) : 0 } },
    "Order import jobs fetched",
    200
  );
});

const getJobStatus = asyncHandler(async (req, res) => {
  const models = getTenantModels(req);
  const { OrderImportJob } = models;

  const jobId = req.params.jobId;
  const job = await OrderImportJob.findByPk(jobId);
  if (!job) return res.status(404).json({ status: "error", message: "Job not found" });

  const resultJson = job?.result_json || {};
  return res.status(200).json({
    status: job.status,
    jobId: job.id,
    totalRows: resultJson?.totalRows ?? null,
    summary: resultJson?.summary ?? null,
    error: job.status === "failed" ? job.last_error : null,
  });
});

const getJobResults = asyncHandler(async (req, res) => {
  const models = getTenantModels(req);
  const { OrderImportJob } = models;

  const jobId = req.params.jobId;
  const job = await OrderImportJob.findByPk(jobId);
  if (!job) return res.status(404).json({ status: "error", message: "Job not found" });

  return res.status(200).json({
    jobId: job.id,
    results: getJobRowResultsOrEmpty(job),
    result_json: getJobResultPayload(job),
  });
});

const downloadJobExcel = asyncHandler(async (req, res) => {
  const models = getTenantModels(req);
  const { OrderImportJob } = models;

  const jobId = req.params.jobId;
  const job = await OrderImportJob.findByPk(jobId);
  if (!job) return res.status(404).json({ status: "error", message: "Job not found" });

  if (job.status !== "completed" || !job.result_excel_key) {
    return res.status(409).json({ status: "error", message: "Excel not ready yet" });
  }

  const bucketClient = await getTenantBucketClient(req);
  const object = await bucketService.getObjectWithClient(bucketClient, job.result_excel_key);

  const filename = `order-import-result-${job.id}.xlsx`;
  res.setHeader("Content-Type", object?.contentType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(object.body);
});

module.exports = {
  getSampleCsv,
  uploadImportCsv,
  listJobs,
  getJobStatus,
  getJobResults,
  downloadJobExcel,
};

