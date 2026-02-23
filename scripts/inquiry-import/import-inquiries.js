#!/usr/bin/env node
"use strict";

/**
 * Inquiry Import Script
 *
 * Imports inquiries from CSV (e.g. Inquiry.sample.csv format).
 * Usage:
 *   node scripts/inquiry-import/import-inquiries.js --file inquiries.csv
 *   node scripts/inquiry-import/import-inquiries.js --file inquiries.csv --dry-run
 *   node scripts/inquiry-import/import-inquiries.js --file inquiries.csv --update-existing
 */

const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");
const ExcelJS = require("exceljs");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const db = require("../../src/models/index.js");
const { INQUIRY_STATUS } = require("../../src/common/utils/constants.js");

const {
    Inquiry,
    Customer,
    User,
    InquirySource,
    ProjectScheme,
    OrderType,
    Discom,
    CompanyBranch,
    State,
    City,
} = db;

function trim(s) {
    return typeof s === "string" ? s.trim() : (s == null ? "" : String(s));
}

/** Parse date; supports DD-MM-YYYY and ISO */
function parseDate(v) {
    const s = trim(v);
    if (!s) return null;
    const parts = s.split(/[-/]/);
    if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        if (d >= 1 && d <= 31 && m >= 0 && m <= 11 && y >= 1900 && y <= 2100) {
            const date = new Date(y, m, d);
            if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
        }
    }
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

function mapCsvStageToStatus(stage) {
    const s = trim(stage).toLowerCase();
    if (s === "quotation") return INQUIRY_STATUS.QUOTATION;
    if (s === "connected") return INQUIRY_STATUS.CONNECTED;
    if (s === "site visit done") return INQUIRY_STATUS.SITE_VISIT_DONE;
    if (s === "under discussion") return INQUIRY_STATUS.UNDER_DISCUSSION;
    if (s === "converted") return INQUIRY_STATUS.CONVERTED;
    return INQUIRY_STATUS.NEW;
}

async function resolveReferences() {
    const [
        inquirySources,
        projectSchemes,
        orderTypes,
        discoms,
        branches,
        states,
        cities,
        users,
    ] = await Promise.all([
        InquirySource.findAll({ where: { deleted_at: null }, attributes: ["id", "source_name"] }),
        ProjectScheme.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        OrderType.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        Discom.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        CompanyBranch.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        State.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        City.findAll({ where: { deleted_at: null }, attributes: ["id", "name", "state_id"] }),
        User.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    ]);

    const byName = (arr, key) => {
        const m = new Map();
        arr.forEach((r) => {
            const n = (r[key] || "").toString().toLowerCase().trim();
            if (n && !m.has(n)) m.set(n, r.id);
        });
        return m;
    };

    const userByName = () => {
        const m = new Map();
        users.forEach((r) => {
            const n = (r.name || "").toString().toLowerCase().trim();
            if (n && !m.has(n)) m.set(n, r.id);
        });
        return m;
    };

    return {
        inquirySource: byName(inquirySources, "source_name"),
        projectScheme: byName(projectSchemes, "name"),
        orderType: byName(orderTypes, "name"),
        discom: byName(discoms, "name"),
        branch: byName(branches, "name"),
        state: byName(states, "name"),
        userByName: userByName(),
        _raw: { inquirySources, projectSchemes, orderTypes, discoms, branches, states, cities, users },
    };
}

function getRow(row, key) {
    return trim(row[key] ?? row[key.trim()] ?? "");
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

    const branchId = get(refs.branch, getRow(row, "Branch"), "Branch");
    const projectSchemeId = getOptional(refs.projectScheme, getRow(row, "Project Scheme"));
    const orderTypeId = getOptional(refs.orderType, getRow(row, "Order Type"));
    const discomId = getOptional(refs.discom, getRow(row, "Discom"));
    const inquirySourceId = getOptional(refs.inquirySource, getRow(row, "Source"));
    const stateId = getOptional(refs.state, getRow(row, "State"));

    let cityId = null;
    const cityName = getRow(row, "City");
    if (cityName && refs._raw.cities) {
        const match = refs._raw.cities.find((c) => {
            const cn = (c.name || "").toLowerCase().trim();
            const sn = cityName.toLowerCase().trim();
            if (cn !== sn) return false;
            if (stateId && c.state_id !== stateId) return false;
            return true;
        });
        if (match) cityId = match.id;
    }

    const handledById = getOptional(refs.userByName, getRow(row, "Handled By"));
    const inquiryById = getOptional(refs.userByName, getRow(row, "Inquiry By"));
    const channelPartnerId = getOptional(refs.userByName, getRow(row, "Channel Partner"));

    return {
        branchId,
        projectSchemeId,
        orderTypeId,
        discomId,
        inquirySourceId,
        stateId,
        cityId,
        handledById,
        inquiryById,
        channelPartnerId,
        errors: errs,
    };
}

async function findOrCreateCustomer(row, ids, transaction) {
    const mobile = getRow(row, "Mobile");
    const name = getRow(row, "Name");
    if (!mobile && !name) return { customerId: null, error: "Name or Mobile required" };

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
                address: getRow(row, "Address") || null,
                state_id: ids.stateId || null,
                city_id: ids.cityId || null,
                pin_code: getRow(row, "Pincode") || null,
                company_name: getRow(row, "Company") || null,
                phone_no: getRow(row, "Phone No") || null,
                landmark_area: getRow(row, "Area") || null,
            },
            { transaction }
        );
    }

    return { customerId: customer.id, error: null };
}

async function processRow(row, refs, options, errorsOut) {
    const rowNum = (row._rowIndex ?? 0) + 2;
    const pui = getRow(row, "PUI");
    const name = getRow(row, "Name");
    const mobile = getRow(row, "Mobile");

    if (!name && !mobile) {
        errorsOut.push({ row: rowNum, inquiry_number: pui || "", error: "Name or Mobile required" });
        return { ok: false, skipped: false };
    }

    const ids = resolveRowReferences(row, refs);
    if (ids.errors.length) {
        errorsOut.push({
            row: rowNum,
            inquiry_number: pui || "",
            error: ids.errors.join("; "),
        });
        return { ok: false, skipped: false };
    }

    if (!ids.branchId) {
        errorsOut.push({ row: rowNum, inquiry_number: pui || "", error: "Branch is required" });
        return { ok: false, skipped: false };
    }

    const { dryRun, updateExisting } = options;

    if (dryRun) {
        return { ok: true, skipped: false, dryRun: true, inquiry_number: pui || null };
    }

    const t = await db.sequelize.transaction();
    try {
        let existingInquiry = null;
        if (pui && updateExisting) {
            existingInquiry = await Inquiry.findOne({
                where: { inquiry_number: pui, deleted_at: null },
                transaction: t,
            });
        }

        if (existingInquiry) {
            const customer = await Customer.findByPk(existingInquiry.customer_id, { transaction: t });
            if (customer) {
                await customer.update(
                    {
                        customer_name: name || customer.customer_name,
                        mobile_number: mobile || customer.mobile_number,
                        address: getRow(row, "Address") ?? customer.address,
                        state_id: ids.stateId ?? customer.state_id,
                        city_id: ids.cityId ?? customer.city_id,
                        pin_code: getRow(row, "Pincode") ?? customer.pin_code,
                        company_name: getRow(row, "Company") ?? customer.company_name,
                        phone_no: getRow(row, "Phone No") ?? customer.phone_no,
                        landmark_area: getRow(row, "Area") ?? customer.landmark_area,
                    },
                    { transaction: t }
                );
            }

            const status = mapCsvStageToStatus(getRow(row, "Stage"));
            await existingInquiry.update(
                {
                    inquiry_source_id: ids.inquirySourceId ?? existingInquiry.inquiry_source_id,
                    date_of_inquiry: parseDate(getRow(row, "Created On")) ?? existingInquiry.date_of_inquiry,
                    inquiry_by: ids.inquiryById ?? existingInquiry.inquiry_by,
                    handled_by: ids.handledById ?? existingInquiry.handled_by,
                    channel_partner: ids.channelPartnerId ?? existingInquiry.channel_partner,
                    branch_id: ids.branchId,
                    project_scheme_id: ids.projectSchemeId ?? existingInquiry.project_scheme_id,
                    capacity: parseFloatSafeOrZero(getRow(row, "Capacity")),
                    order_type: ids.orderTypeId ?? existingInquiry.order_type,
                    discom_id: ids.discomId ?? existingInquiry.discom_id,
                    rating: getRow(row, "Rating") || existingInquiry.rating,
                    remarks: getRow(row, "Inquiry Remarks") ?? existingInquiry.remarks,
                    next_reminder_date: parseDate(getRow(row, "Next Reminder")) ?? existingInquiry.next_reminder_date,
                    reference_from: getRow(row, "Reference") || existingInquiry.reference_from,
                    status,
                },
                { transaction: t }
            );

            await t.commit();
            return {
                ok: true,
                skipped: false,
                updated: true,
                inquiryId: existingInquiry.id,
                inquiry_number: existingInquiry.inquiry_number,
            };
        }

        if (pui) {
            const duplicate = await Inquiry.findOne({
                where: { inquiry_number: pui, deleted_at: null },
                transaction: t,
            });
            if (duplicate) {
                await t.rollback();
                errorsOut.push({
                    row: rowNum,
                    inquiry_number: pui,
                    error: `inquiry_number "${pui}" already exists; use --update-existing to update`,
                });
                return { ok: false, skipped: false };
            }
        }

        const cust = await findOrCreateCustomer(row, ids, t);
        if (cust.error) {
            errorsOut.push({ row: rowNum, inquiry_number: pui || "", error: cust.error });
            await t.rollback();
            return { ok: false, skipped: false };
        }

        const status = mapCsvStageToStatus(getRow(row, "Stage"));
        const inquiryPayload = {
            inquiry_number: pui || undefined,
            inquiry_source_id: ids.inquirySourceId || null,
            customer_id: cust.customerId,
            date_of_inquiry: parseDate(getRow(row, "Created On")) || null,
            inquiry_by: ids.inquiryById || null,
            handled_by: ids.handledById || null,
            channel_partner: ids.channelPartnerId || null,
            branch_id: ids.branchId,
            project_scheme_id: ids.projectSchemeId || null,
            capacity: parseFloatSafeOrZero(getRow(row, "Capacity")),
            order_type: ids.orderTypeId || null,
            discom_id: ids.discomId || null,
            rating: getRow(row, "Rating") || null,
            remarks: getRow(row, "Inquiry Remarks") || null,
            next_reminder_date: parseDate(getRow(row, "Next Reminder")) || null,
            reference_from: getRow(row, "Reference") || null,
            status,
            is_dead: false,
            do_not_send_message: false,
        };

        const created = await Inquiry.create(inquiryPayload, { transaction: t });
        await t.commit();

        return {
            ok: true,
            skipped: false,
            inquiryId: created.id,
            inquiry_number: created.inquiry_number,
        };
    } catch (err) {
        await t.rollback();
        errorsOut.push({
            row: rowNum,
            inquiry_number: pui || "",
            error: err.message || String(err),
        });
        return { ok: false, skipped: false };
    }
}

function writeResultExcel(errors, createdRows, updatedRows, outputPath) {
    const workbook = new ExcelJS.Workbook();

    const errorsSheet = workbook.addWorksheet("errors", { headerRow: true });
    errorsSheet.columns = [
        { header: "row", key: "row", width: 8 },
        { header: "inquiry_number", key: "inquiry_number", width: 22 },
        { header: "error", key: "error", width: 50 },
    ];
    errorsSheet.getRow(1).font = { bold: true };
    (errors || []).forEach((e) => {
        errorsSheet.addRow({ row: e.row, inquiry_number: e.inquiry_number || "", error: e.error || "" });
    });

    const createdSheet = workbook.addWorksheet("created", { headerRow: true });
    createdSheet.columns = [
        { header: "row", key: "row", width: 8 },
        { header: "inquiry_number", key: "inquiry_number", width: 22 },
        { header: "inquiry_id", key: "inquiry_id", width: 12 },
    ];
    createdSheet.getRow(1).font = { bold: true };
    (createdRows || []).forEach((r) => {
        createdSheet.addRow({ row: r.row, inquiry_number: r.inquiry_number || "", inquiry_id: r.inquiry_id ?? "" });
    });

    const updatedSheet = workbook.addWorksheet("updated", { headerRow: true });
    updatedSheet.columns = [
        { header: "row", key: "row", width: 8 },
        { header: "inquiry_number", key: "inquiry_number", width: 22 },
        { header: "inquiry_id", key: "inquiry_id", width: 12 },
    ];
    updatedSheet.getRow(1).font = { bold: true };
    (updatedRows || []).forEach((r) => {
        updatedSheet.addRow({ row: r.row, inquiry_number: r.inquiry_number || "", inquiry_id: r.inquiry_id ?? "" });
    });

    return workbook.xlsx.writeFile(outputPath);
}

async function main() {
    const args = process.argv.slice(2);
    const files = [];
    let dryRun = false;
    let updateExisting = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--file" && args[i + 1]) {
            files.push(args[++i]);
        } else if (args[i] === "--dry-run") {
            dryRun = true;
        } else if (args[i] === "--update-existing") {
            updateExisting = true;
        }
    }

    if (files.length === 0) {
        console.error(
            "Usage: node scripts/inquiry-import/import-inquiries.js --file <path> [--file <path>...] [--dry-run] [--update-existing]"
        );
        process.exit(1);
    }

    console.log("Inquiry Import");
    if (dryRun) console.log("DRY RUN – no changes will be written.\n");
    if (updateExisting) console.log("UPDATE EXISTING – inquiries with matching PUI will be updated.\n");

    const errors = [];
    const createdRows = [];
    const updatedRows = [];
    let total = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;

    const refs = await resolveReferences();

    for (const filePath of files) {
        const resolvedPath = path.resolve(filePath);
        if (!fs.existsSync(resolvedPath)) {
            console.error("File not found:", resolvedPath);
            continue;
        }

        console.log("\nProcessing:", resolvedPath);

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
            const rowNum = i + 2;
            total++;
            const result = await processRow(rows[i], refs, { dryRun, updateExisting }, errors);
            if (result.updated) {
                updated++;
                updatedRows.push({
                    row: rowNum,
                    inquiry_number: result.inquiry_number || "",
                    inquiry_id: result.inquiryId ?? "",
                });
            } else if (result.ok) {
                created++;
                createdRows.push({
                    row: rowNum,
                    inquiry_number: result.inquiry_number || "",
                    inquiry_id: result.inquiryId ?? "",
                });
            } else {
                failed++;
            }
        }
    }

    console.log("\n--- Summary ---");
    console.log("Total rows:", total);
    console.log("Created:", created);
    console.log("Updated:", updated);
    console.log("Failed:", failed);

    const resultPath = path.resolve(process.cwd(), "inquiry-import-result.xlsx");
    await writeResultExcel(errors, createdRows, updatedRows, resultPath);
    console.log("Result file (errors, created, updated):", resultPath);

    await db.sequelize.close();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
