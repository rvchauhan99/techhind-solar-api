#!/usr/bin/env node
"use strict";

/**
 * Order Import Script – Go Live Migration
 *
 * Imports orders from CSV files. No documents, images, or challans.
 * Usage:
 *   node scripts/order-import/import-orders.js --file open-orders.csv
 *   node scripts/order-import/import-orders.js --file completed-orders.csv --dry-run
 *   node scripts/order-import/import-orders.js --file open.csv --file completed.csv
 */

const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const db = require("../../src/models/index.js");
const orderService = require("../../src/modules/order/order.service.js");

const {
    Order,
    Customer,
    User,
    InquirySource,
    ProjectScheme,
    OrderType,
    Discom,
    CompanyBranch,
    CompanyWarehouse,
    State,
    City,
    Division,
    SubDivision,
} = db;

const STAGE_ORDER = [
    "estimate_generated",
    "estimate_paid",
    "planner",
    "delivery",
    "assign_fabricator_and_installer",
    "fabrication",
    "installation",
    "netmeter_apply",
    "netmeter_installed",
    "subsidy_claim",
    "subsidy_disbursed",
];

function inferStagesFromCurrentStage(currentStageKey, allCompleted = false) {
    const stages = {};
    if (allCompleted) {
        STAGE_ORDER.forEach((key) => { stages[key] = "completed"; });
        return stages;
    }
    const idx = STAGE_ORDER.indexOf(String(currentStageKey || "").trim());
    STAGE_ORDER.forEach((key, i) => {
        if (i < idx) stages[key] = "completed";
        else if (i === idx) stages[key] = "pending";
        else stages[key] = "locked";
    });
    return Object.keys(stages).length ? stages : null;
}

function trim(s) {
    return typeof s === "string" ? s.trim() : (s == null ? "" : String(s));
}

function parseBool(v) {
    const s = String(v || "").toLowerCase().trim();
    return s === "true" || s === "1" || s === "yes";
}

function parseDate(v) {
    const s = trim(v);
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseFloatSafe(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
}

function parseFloatSafeOrZero(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

function parseIntegerSafe(v) {
    const n = parseInt(v, 10);
    return Number.isInteger(n) ? n : null;
}

async function resolveReferences() {
    const [
        inquirySources,
        projectSchemes,
        orderTypes,
        discoms,
        branches,
        warehouses,
        states,
        cities,
        divisions,
        subDivisions,
        users,
    ] = await Promise.all([
        InquirySource.findAll({ where: { deleted_at: null }, attributes: ["id", "source_name"] }),
        ProjectScheme.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        OrderType.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        Discom.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        CompanyBranch.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        CompanyWarehouse.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        State.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        City.findAll({ where: { deleted_at: null }, attributes: ["id", "name", "state_id"] }),
        Division.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        SubDivision.findAll({ where: { deleted_at: null }, attributes: ["id", "name", "division_id"] }),
        User.findAll({ where: { deleted_at: null }, attributes: ["id", "email"] }),
    ]);

    const byName = (arr, key) => {
        const m = new Map();
        arr.forEach((r) => {
            const n = (r[key] || "").toString().toLowerCase().trim();
            if (n && !m.has(n)) m.set(n, r.id);
        });
        return m;
    };

    const byEmail = () => {
        const m = new Map();
        users.forEach((r) => {
            const e = (r.email || "").toString().toLowerCase().trim();
            if (e && !m.has(e)) m.set(e, r.id);
        });
        return m;
    };

    return {
        inquirySource: byName(inquirySources, "source_name"),
        projectScheme: byName(projectSchemes, "name"),
        orderType: byName(orderTypes, "name"),
        discom: byName(discoms, "name"),
        branch: byName(branches, "name"),
        warehouse: byName(warehouses, "name"),
        state: byName(states, "name"),
        city: new Map(), // city needs state_id; resolve per row
        division: byName(divisions, "name"),
        subDivision: new Map(), // needs division; resolve per row
        userByEmail: byEmail(),
        _raw: { inquirySources, projectSchemes, orderTypes, discoms, branches, warehouses, states, cities, divisions, subDivisions, users },
    };
}

function resolveRowReferences(row, refs) {
    const errs = [];
    const get = (map, val, label) => {
        const v = trim(val);
        if (!v) return null;
        const id = map.get(v.toLowerCase());
        if (id == null) errs.push(`${label} not found: "${v}"`);
        return id;
    };
    const getOptional = (map, val) => {
        const v = trim(val);
        if (!v) return null;
        return map.get(v.toLowerCase()) ?? null;
    };

    const branchId = get(refs.branch, row.branch_name, "branch_name");
    const projectSchemeId = get(refs.projectScheme, row.project_scheme_name, "project_scheme_name");
    const orderTypeId = get(refs.orderType, row.order_type_name, "order_type_name");
    const discomId = get(refs.discom, row.discom_name, "discom_name");
    const inquirySourceId = get(refs.inquirySource, row.inquiry_source_name, "inquiry_source_name");
    const inquiryById = get(refs.userByEmail, row.inquiry_by_email, "inquiry_by_email");
    const handledById = get(refs.userByEmail, row.handled_by_email, "handled_by_email");

    let stateId = getOptional(refs.state, row.state_name);
    let cityId = null;
    if (row.city_name) {
        const cities = refs._raw.cities;
        const match = cities.find((c) => {
            const cn = (c.name || "").toLowerCase().trim();
            const sn = (row.city_name || "").toLowerCase().trim();
            if (cn !== sn) return false;
            if (stateId && c.state_id !== stateId) return false;
            return true;
        });
        if (match) cityId = match.id;
    }

    let divisionId = getOptional(refs.division, row.division_name);
    let subDivisionId = null;
    if (row.sub_division_name && divisionId) {
        const subs = refs._raw.subDivisions.filter((s) => s.division_id === divisionId);
        const match = subs.find((s) => (s.name || "").toLowerCase().trim() === (row.sub_division_name || "").toLowerCase().trim());
        if (match) subDivisionId = match.id;
    }

    const channelPartnerId = getOptional(refs.userByEmail, row.channel_partner_email);
    const plannedWarehouseId = getOptional(refs.warehouse, row.planned_warehouse_name);
    const fabricatorInstallerId = getOptional(refs.userByEmail, row.fabricator_installer_email);

    return {
        branchId,
        projectSchemeId,
        orderTypeId,
        discomId,
        inquirySourceId,
        inquiryById,
        handledById,
        stateId,
        cityId,
        divisionId,
        subDivisionId,
        channelPartnerId,
        plannedWarehouseId,
        fabricatorInstallerId,
        errors: errs,
    };
}

async function findOrCreateCustomer(row, ids, transaction) {
    const mobile = trim(row.mobile_number);
    const name = trim(row.customer_name);
    if (!mobile && !name) return { customerId: null, error: "mobile_number or customer_name required" };

    let customer = null;
    if (mobile) {
        customer = await Customer.findOne({
            where: { deleted_at: null, mobile_number: mobile },
            transaction,
        });
    }
    if (!customer && name) {
        customer = await Customer.findOne({
            where: { deleted_at: null, customer_name: name },
            transaction,
        });
    }

    if (!customer) {
        customer = await Customer.create(
            {
                customer_name: name || "Unknown",
                mobile_number: mobile || null,
                address: trim(row.address) || null,
                state_id: ids.stateId || null,
                city_id: ids.cityId || null,
                pin_code: trim(row.pin_code) || null,
                company_name: trim(row.company_name) || null,
                phone_no: trim(row.phone_no) || null,
                email_id: trim(row.email_id) || null,
                landmark_area: trim(row.landmark_area) || null,
                taluka: trim(row.taluka) || null,
                district: trim(row.district) || null,
            },
            { transaction }
        );
    }

    return { customerId: customer.id, error: null };
}

function buildStagePayload(row, currentStageKey, status = "confirmed") {
    const allCompleted = status === "completed";
    const stages = inferStagesFromCurrentStage(currentStageKey, allCompleted);
    const payload = {
        stages,
        current_stage_key: allCompleted ? "subsidy_disbursed" : (currentStageKey || "estimate_generated"),
    };

    if (row.estimate_amount != null && row.estimate_amount !== "") payload.estimate_amount = parseFloatSafe(row.estimate_amount);
    if (row.estimate_due_date) payload.estimate_due_date = parseDate(row.estimate_due_date);
    if (row.estimate_paid_at) payload.estimate_paid_at = parseDate(row.estimate_paid_at);
    if (row.estimate_paid_by) payload.estimate_paid_by = trim(row.estimate_paid_by);
    if (row.zero_amount_estimate != null && row.zero_amount_estimate !== "")
        payload.zero_amount_estimate = parseBool(row.zero_amount_estimate);

    if (row.planned_delivery_date) payload.planned_delivery_date = parseDate(row.planned_delivery_date);
    if (row.planned_priority) payload.planned_priority = trim(row.planned_priority);
    if (row.planned_warehouse_name) {
        // planned_warehouse_id resolved separately; passed in ids
    }
    if (row.planner_completed_at) payload.planner_completed_at = parseDate(row.planner_completed_at);
    if (row.planned_solar_panel_qty != null && row.planned_solar_panel_qty !== "")
        payload.planned_solar_panel_qty = parseIntegerSafe(row.planned_solar_panel_qty);
    if (row.planned_inverter_qty != null && row.planned_inverter_qty !== "")
        payload.planned_inverter_qty = parseIntegerSafe(row.planned_inverter_qty);

    if (row.fabricator_installer_are_same != null && row.fabricator_installer_are_same !== "")
        payload.fabricator_installer_are_same = parseBool(row.fabricator_installer_are_same);
    if (row.fabrication_due_date) payload.fabrication_due_date = parseDate(row.fabrication_due_date);
    if (row.installation_due_date) payload.installation_due_date = parseDate(row.installation_due_date);
    if (row.fabrication_completed_at) payload.fabrication_completed_at = parseDate(row.fabrication_completed_at);
    if (row.installation_completed_at) payload.installation_completed_at = parseDate(row.installation_completed_at);

    if (row.netmeter_applied != null && row.netmeter_applied !== "")
        payload.netmeter_applied = parseBool(row.netmeter_applied);
    if (row.netmeter_applied_on) payload.netmeter_applied_on = parseDate(row.netmeter_applied_on);
    if (row.netmeter_installed != null && row.netmeter_installed !== "")
        payload.netmeter_installed = parseBool(row.netmeter_installed);
    if (row.netmeter_installed_on) payload.netmeter_installed_on = parseDate(row.netmeter_installed_on);

    if (row.subsidy_claim != null && row.subsidy_claim !== "") payload.subsidy_claim = parseBool(row.subsidy_claim);
    if (row.claim_date) payload.claim_date = parseDate(row.claim_date);
    if (row.subsidy_disbursed != null && row.subsidy_disbursed !== "")
        payload.subsidy_disbursed = parseBool(row.subsidy_disbursed);
    else if (status === "completed") payload.subsidy_disbursed = true;
    if (row.disbursed_date) payload.disbursed_date = parseDate(row.disbursed_date);

    if (row.order_remarks) payload.order_remarks = trim(row.order_remarks);

    return payload;
}

async function processRow(row, status, refs, dryRun, errorsOut) {
    const rowNum = (row._rowIndex || 0) + 2; // 1-based + header
    const orderNumber = trim(row.order_number);

    if (!orderNumber) {
        errorsOut.push({ row: rowNum, order_number: "", error: "order_number is required" });
        return { ok: false, skipped: false };
    }

    const ids = resolveRowReferences(row, refs);
    if (ids.errors.length) {
        errorsOut.push({
            row: rowNum,
            order_number: orderNumber,
            error: ids.errors.join("; "),
        });
        return { ok: false, skipped: false };
    }

    if (!ids.inquiryById || !ids.handledById) {
        errorsOut.push({ row: rowNum, order_number: orderNumber, error: "inquiry_by_email and handled_by_email are required" });
        return { ok: false, skipped: false };
    }

    if (dryRun) {
        return { ok: true, skipped: false, dryRun: true };
    }

    const t = await db.sequelize.transaction();
    try {
        const existingOrder = await Order.findOne({
            where: { order_number: orderNumber, deleted_at: null },
            transaction: t,
        });
        if (existingOrder) {
            await t.commit();
            return { ok: true, skipped: true, reason: "order_number already exists" };
        }

        const cust = await findOrCreateCustomer(row, ids, t);
        if (cust.error) {
            errorsOut.push({ row: rowNum, order_number: orderNumber, error: cust.error });
            await t.rollback();
            return { ok: false, skipped: false };
        }

        const createPayload = {
            order_number: orderNumber,
            status,
            order_date: parseDate(row.order_date) || new Date().toISOString().slice(0, 10),
            inquiry_source_id: ids.inquirySourceId,
            inquiry_by: ids.inquiryById,
            handled_by: ids.handledById,
            branch_id: ids.branchId,
            channel_partner_id: ids.channelPartnerId || null,
            project_scheme_id: ids.projectSchemeId,
            capacity: parseFloatSafeOrZero(row.capacity) || 0,
            project_cost: parseFloatSafeOrZero(row.project_cost) || 0,
            discount: parseFloatSafeOrZero(row.discount) || 0,
            order_type_id: ids.orderTypeId,
            customer_id: cust.customerId,
            discom_id: ids.discomId,
            consumer_no: trim(row.consumer_no) || "",
            division_id: ids.divisionId || null,
            sub_division_id: ids.subDivisionId || null,
            circle: trim(row.circle) || null,
            reference_from: trim(row.reference_from) || null,
        };

        const created = await orderService.createOrder({ payload: createPayload, transaction: t });
        const orderId = created.id;

        const currentStageKey = trim(row.current_stage_key) || "estimate_generated";
        const stagePayload = buildStagePayload(row, currentStageKey, status);
        stagePayload.planned_warehouse_id = ids.plannedWarehouseId || null;
        stagePayload.fabricator_installer_id = ids.fabricatorInstallerId || null;
        stagePayload.fabricator_id = ids.fabricatorInstallerId || null;
        stagePayload.installer_id = ids.fabricatorInstallerId || null;

        await orderService.updateOrder({ id: orderId, payload: stagePayload, transaction: t });

        await t.commit();
        return { ok: true, skipped: false, orderId };
    } catch (err) {
        await t.rollback();
        errorsOut.push({
            row: rowNum,
            order_number: orderNumber,
            error: err.message || String(err),
        });
        return { ok: false, skipped: false };
    }
}

function writeErrorsCsv(errors, outputPath) {
    if (errors.length === 0) return;
    const header = "row,order_number,error\n";
    const rows = errors.map((e) => {
        const row = String(e.row);
        const on = String(e.order_number || "").replace(/"/g, '""');
        const err = String(e.error || "").replace(/"/g, '""');
        return `${row},"${on}","${err}"`;
    });
    fs.writeFileSync(outputPath, header + rows.join("\n"), "utf8");
}

function inferStatusFromFilename(filePath) {
    const base = path.basename(String(filePath || "")).toLowerCase();
    if (base.includes("completed")) return "completed";
    return "confirmed";
}

async function main() {
    const args = process.argv.slice(2);
    const files = [];
    let dryRun = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--file" && args[i + 1]) {
            files.push(args[++i]);
        } else if (args[i] === "--dry-run") {
            dryRun = true;
        }
    }

    if (files.length === 0) {
        console.error("Usage: node scripts/order-import/import-orders.js --file <path> [--file <path>...] [--dry-run]");
        process.exit(1);
    }

    console.log("Order Import – Go Live Migration");
    if (dryRun) console.log("DRY RUN – no changes will be written.\n");

    const errors = [];
    let total = 0;
    let created = 0;
    let skipped = 0;
    let failed = 0;

    const refs = await resolveReferences();

    for (const filePath of files) {
        const resolvedPath = path.resolve(filePath);
        if (!fs.existsSync(resolvedPath)) {
            console.error("File not found:", resolvedPath);
            continue;
        }

        const status = inferStatusFromFilename(resolvedPath);
        console.log(`\nProcessing: ${resolvedPath} (status=${status})`);

        const content = fs.readFileSync(resolvedPath, "utf8");
        let rows;
        try {
            rows = parse(content, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true,
                relax_quotes: true,
            });
        } catch (e) {
            console.error("CSV parse error:", e.message);
            continue;
        }

        for (let i = 0; i < rows.length; i++) {
            rows[i]._rowIndex = i;
            total++;
            const result = await processRow(rows[i], status, refs, dryRun, errors);
            if (result.skipped) skipped++;
            else if (result.ok) created++;
            else failed++;
        }
    }

    console.log("\n--- Summary ---");
    console.log("Total rows:", total);
    console.log("Created:", created);
    console.log("Skipped (existing):", skipped);
    console.log("Failed:", failed);

    const errorsPath = path.join(process.cwd(), "import-errors.csv");
    writeErrorsCsv(errors, path.resolve(errorsPath));
    if (errors.length) console.log("Errors written to:", path.resolve(errorsPath));

    await db.sequelize.close();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
