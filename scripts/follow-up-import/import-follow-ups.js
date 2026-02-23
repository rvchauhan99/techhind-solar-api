#!/usr/bin/env node
"use strict";

/**
 * Follow-up Import Script
 *
 * Imports follow-ups from CSV (e.g. Follow-Up_sample.csv format).
 * Usage:
 *   node scripts/follow-up-import/import-follow-ups.js --file follow-ups.csv
 *   node scripts/follow-up-import/import-follow-ups.js --file follow-ups.csv --dry-run
 */

const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");
const ExcelJS = require("exceljs");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const db = require("../../src/models/index.js");
const { INQUIRY_STATUS, FOLLOWUP_RATING } = require("../../src/common/utils/constants.js");

const { Inquiry, Followup, User } = db;

const STATUS_HIERARCHY = {
    [INQUIRY_STATUS.NEW]: 1,
    [INQUIRY_STATUS.CONNECTED]: 2,
    [INQUIRY_STATUS.SITE_VISIT_DONE]: 3,
    [INQUIRY_STATUS.QUOTATION]: 4,
    [INQUIRY_STATUS.UNDER_DISCUSSION]: 5,
};

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

function mapCsvStageToStatus(stage) {
    const s = trim(stage).toLowerCase();
    if (s === "quotation") return INQUIRY_STATUS.QUOTATION;
    if (s === "connected") return INQUIRY_STATUS.CONNECTED;
    if (s === "site visit done") return INQUIRY_STATUS.SITE_VISIT_DONE;
    if (s === "under discussion") return INQUIRY_STATUS.UNDER_DISCUSSION;
    if (s === "converted") return INQUIRY_STATUS.CONVERTED;
    return INQUIRY_STATUS.NEW;
}

/** Map CSV numeric rating (0-5) to FOLLOWUP_RATING: 1-2 -> Low, 3 -> Medium, 4-5 -> High; 0 or empty -> null */
function mapRatingToFollowupRating(v) {
    const s = trim(v);
    if (s === "") return null;
    const n = parseInt(s, 10);
    if (!Number.isFinite(n)) return null;
    if (n <= 0) return null;
    if (n <= 2) return "Low";
    if (n === 3) return "Medium";
    return "High";
}

async function resolveReferences() {
    const [inquiries, users] = await Promise.all([
        Inquiry.findAll({ where: { deleted_at: null }, attributes: ["id", "inquiry_number"] }),
        User.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    ]);

    const puiToInquiryId = new Map();
    inquiries.forEach((r) => {
        const pui = (r.inquiry_number || "").toString().trim();
        if (pui && !puiToInquiryId.has(pui)) puiToInquiryId.set(pui, r.id);
    });

    const userByName = new Map();
    users.forEach((r) => {
        const n = (r.name || "").toString().toLowerCase().trim();
        if (n && !userByName.has(n)) userByName.set(n, r.id);
    });

    return { puiToInquiryId, userByName };
}

function getRow(row, key) {
    return trim(row[key] ?? row[key.trim()] ?? "");
}

async function processRow(row, refs, options, errorsOut) {
    const rowNum = (row._rowIndex ?? 0) + 2;
    const pui = getRow(row, "PUI");

    if (!pui) {
        errorsOut.push({ row: rowNum, pui: "", error: "PUI required" });
        return { ok: false };
    }

    const inquiryId = refs.puiToInquiryId.get(pui);
    if (inquiryId == null) {
        errorsOut.push({ row: rowNum, pui, error: `Inquiry not found for PUI: ${pui}` });
        return { ok: false };
    }

    const stage = getRow(row, "Stage");
    const inquiryStatus = mapCsvStageToStatus(stage);
    const remarks = getRow(row, "Last Call Remarks") || null;
    const nextReminderRaw = getRow(row, "Reminder Date");
    const nextReminder = parseDate(nextReminderRaw) || null;
    const handledBy = getRow(row, "Handled By");
    const callById = handledBy ? refs.userByName.get(handledBy.toLowerCase()) ?? null : null;
    const rating = mapRatingToFollowupRating(getRow(row, "Rating"));

    const { dryRun } = options;

    if (dryRun) {
        return { ok: true, dryRun: true, pui, followupId: null };
    }

    const t = await db.sequelize.transaction();
    try {
        const inquiry = await Inquiry.findOne({
            where: { id: inquiryId, deleted_at: null },
            transaction: t,
        });
        if (!inquiry) {
            await t.rollback();
            errorsOut.push({ row: rowNum, pui, error: `Inquiry not found for PUI: ${pui}` });
            return { ok: false };
        }

        const currentStatusLevel = STATUS_HIERARCHY[inquiry.status] || 0;
        const connectedStatusLevel = STATUS_HIERARCHY[INQUIRY_STATUS.CONNECTED];
        if (currentStatusLevel < connectedStatusLevel) {
            await inquiry.update({ status: INQUIRY_STATUS.CONNECTED }, { transaction: t });
        }

        if (callById) {
            const user = await User.findOne({
                where: { id: callById, deleted_at: null },
                transaction: t,
            });
            if (user) {
                await inquiry.update({ is_dead: false }, { transaction: t });
            }
        }

        const followupPayload = {
            inquiry_id: inquiryId,
            inquiry_status: inquiryStatus,
            remarks,
            next_reminder: nextReminder,
            call_by: callById || null,
            is_schedule_site_visit: false,
            is_msg_send_to_customer: false,
            rating: rating || null,
        };

        const followup = await Followup.create(followupPayload, { transaction: t });
        await t.commit();

        return {
            ok: true,
            pui,
            followupId: followup.id,
        };
    } catch (err) {
        await t.rollback();
        errorsOut.push({
            row: rowNum,
            pui,
            error: err.message || String(err),
        });
        return { ok: false };
    }
}

function writeResultExcel(errors, createdRows, outputPath) {
    const workbook = new ExcelJS.Workbook();

    const errorsSheet = workbook.addWorksheet("errors", { headerRow: true });
    errorsSheet.columns = [
        { header: "row", key: "row", width: 8 },
        { header: "pui", key: "pui", width: 22 },
        { header: "error", key: "error", width: 50 },
    ];
    errorsSheet.getRow(1).font = { bold: true };
    (errors || []).forEach((e) => {
        errorsSheet.addRow({ row: e.row, pui: e.pui || "", error: e.error || "" });
    });

    const createdSheet = workbook.addWorksheet("created", { headerRow: true });
    createdSheet.columns = [
        { header: "row", key: "row", width: 8 },
        { header: "pui", key: "pui", width: 22 },
        { header: "followup_id", key: "followup_id", width: 14 },
    ];
    createdSheet.getRow(1).font = { bold: true };
    (createdRows || []).forEach((r) => {
        createdSheet.addRow({ row: r.row, pui: r.pui || "", followup_id: r.followup_id ?? "" });
    });

    return workbook.xlsx.writeFile(outputPath);
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
        console.error(
            "Usage: node scripts/follow-up-import/import-follow-ups.js --file <path> [--file <path>...] [--dry-run]"
        );
        process.exit(1);
    }

    console.log("Follow-up Import");
    if (dryRun) console.log("DRY RUN – no changes will be written.\n");

    const errors = [];
    const createdRows = [];
    let total = 0;
    let created = 0;
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
            const result = await processRow(rows[i], refs, { dryRun }, errors);
            if (result.ok) {
                created++;
                createdRows.push({
                    row: rowNum,
                    pui: result.pui || "",
                    followup_id: result.followupId ?? "",
                });
            } else {
                failed++;
            }
        }
    }

    console.log("\n--- Summary ---");
    console.log("Total rows:", total);
    console.log("Created:", created);
    console.log("Failed:", failed);

    const resultPath = path.resolve(process.cwd(), "follow-up-import-result.xlsx");
    await writeResultExcel(errors, createdRows, resultPath);
    console.log("Result file (errors, created):", resultPath);

    await db.sequelize.close();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
