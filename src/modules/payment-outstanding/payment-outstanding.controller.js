"use strict";

const service = require("./payment-outstanding.service.js");
const { Parser } = require("json2csv");

const ORDER_STAGE_LABELS = {
  estimate_generated: "Estimate Generated",
  estimate_paid: "Estimate Paid",
  planner: "Planner",
  delivery: "Delivery",
  assign_fabricator_and_installer: "Assign Fabricator & Installer",
  fabrication: "Fabrication",
  installation: "Installation",
  netmeter_apply: "Netmeter Apply",
  netmeter_installed: "Netmeter Installed",
  subsidy_claim: "Subsidy Claim",
  subsidy_disbursed: "Subsidy Disbursed",
  order_completed: "Order Completed",
  payment_outstanding: "Order Completed but payment pending",
};

function orderStageLabel(o) {
  const key = o.get?.("current_stage_key") ?? o.dataValues?.current_stage_key ?? o.current_stage_key;
  if (key == null || key === "") return "";
  return ORDER_STAGE_LABELS[key] || String(key);
}

async function list(req, res, next) {
  try {
    const result = await service.listOutstanding(req.query || {}, req);
    res.json({ status: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function kpis(req, res, next) {
  try {
    const result = await service.kpis(req.query || {}, req);
    res.json({ status: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function trend(req, res, next) {
  try {
    const result = await service.trend(req.query || {});
    res.json({ status: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function analysis(req, res, next) {
  try {
    const result = await service.analysis(req.query || {});
    res.json({ status: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function exportList(req, res, next) {
  try {
    const result = await service.listOutstanding({ ...req.query, page: 1, limit: 10000 }, req);
    const rows = (result.data || []).map((o) => ({
      order_number: o.order_number,
      capacity: o.capacity,
      customer_name: o.customer?.name || "",
      mobile: o.customer?.mobile_number || "",
      project_cost: Number(o.project_cost || 0),
      total_paid: Number(o.get?.("total_paid") ?? o.dataValues?.total_paid ?? 0),
      outstanding: Number(o.get?.("outstanding") ?? o.dataValues?.outstanding ?? 0),
      payment_type: o.payment_type || "",
      loan_type: o.loanType?.name || "",
      order_stage: orderStageLabel(o),
      subsidy_disbursed_date: o.disbursed_date ? new Date(o.disbursed_date).toISOString().slice(0, 10) : "",
      netmeter_apply_date: o.netmeter_applied_on ? new Date(o.netmeter_applied_on).toISOString().slice(0, 10) : "",
      delivery_date: o.planned_delivery_date ? new Date(o.planned_delivery_date).toISOString().slice(0, 10) : "",
      branch: o.branch?.name || "",
      handled_by: o.handledBy?.name || "",
      order_date: o.order_date ? new Date(o.order_date).toISOString().slice(0, 10) : "",
    }));
    const parser = new Parser();
    const csv = parser.parse(rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=payment-outstanding.csv");
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}

async function listFollowUps(req, res, next) {
  try {
    const { order_id } = req.params;
    const data = await service.listFollowUps(order_id, req.query);
    res.json({ status: true, data });
  } catch (err) {
    next(err);
  }
}

async function createFollowUp(req, res, next) {
  try {
    const { order_id } = req.params;
    const item = await service.createFollowUp(order_id, req.body || {});
    res.status(201).json({ status: true, data: item });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  kpis,
  trend,
  analysis,
  exportList,
  listFollowUps,
  createFollowUp,
};

