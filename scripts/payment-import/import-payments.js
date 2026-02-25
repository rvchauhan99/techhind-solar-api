#!/usr/bin/env node
"use strict";

/**
 * Payment Import Script
 *
 * Imports payments from payment_proofs_from_html CSV.
 * Matches PUI to Order.order_number; creates OrderPaymentDetail rows.
 * When "Payment Proof URL" is present, fetches the document and uploads to the bucket,
 * storing the bucket path in receipt_cheque_file (not the raw URL).
 *
 * Usage:
 *   node scripts/payment-import/import-payments.js --file /path/to/payment_proofs_from_html.csv
 *   node scripts/payment-import/import-payments.js --file payments.csv --dry-run
 *   node scripts/payment-import/import-payments.js --file payment_proofs_from_html.csv --proofs-only
 *
 * --proofs-only: Only attach payment proofs to existing OrderPaymentDetail rows (no new rows).
 *   Matches by PUI (order_id), Payment Date, and Amount. Requires BUCKET_* env for upload.
 */

const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const db = require("../../src/models/index.js");
const bucketService = require("../../src/common/services/bucket.service.js");
const {
    Order,
    OrderPaymentDetail,
    PaymentMode,
    Bank,
    CompanyBankAccount,
    User,
} = db;

const PAYMENT_PROOF_PREFIX = "order-payments";

function trim(s) {
    return typeof s === "string" ? s.trim() : (s == null ? "" : String(s));
}

/** Parse DD-MM-YYYY or similar to Date; return ISO date string (YYYY-MM-DD) or null. */
function parseDate(v) {
    const s = trim(v);
    if (!s) return null;
    const parts = s.split(/[-/]/);
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        if (Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year)) {
            const d = new Date(year, month, day);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        }
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Parse to Date object for date_of_payment (stored as DATE). */
function parseDateObject(v) {
    const iso = parseDate(v);
    if (!iso) return null;
    return new Date(iso + "T12:00:00.000Z");
}

function parseFloatSafe(v) {
    const n = parseFloat(String(v || "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
}

/** Map Audit Status CSV value to OrderPaymentDetail status. */
function mapAuditStatus(auditStatus) {
    const s = trim(auditStatus).toLowerCase();
    if (s === "verified") return "approved";
    if (s === "dispute" || s === "cheque bounce") return "rejected";
    return "pending_approval";
}

/**
 * Fetch document from URL and upload to bucket. Returns bucket path or null on failure.
 * @param {string} url - Payment Proof URL
 * @returns {Promise<string|null>} - Bucket path (key) or null
 */
async function fetchAndUploadProof(url) {
    if (!url || !url.trim().startsWith("http")) return null;
    try {
        const result = await bucketService.uploadFromUrl(url.trim(), {
            prefix: PAYMENT_PROOF_PREFIX,
            acl: "private",
        });
        return result ? result.path : null;
    } catch (err) {
        throw err;
    }
}

async function resolveReferences() {
    const [orders, paymentModes, banks, companyBankAccounts, users] = await Promise.all([
        Order.findAll({ where: { deleted_at: null }, attributes: ["id", "order_number"] }),
        PaymentMode.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        Bank.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
        CompanyBankAccount.findAll({
            where: { deleted_at: null, is_active: true },
            order: [
                ["is_default", "DESC"],
                ["created_at", "ASC"],
            ],
            limit: 1,
            attributes: ["id"],
        }),
        User.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    ]);

    const orderByNumber = new Map();
    orders.forEach((o) => {
        const key = String(o.order_number || "").trim();
        if (key && !orderByNumber.has(key)) orderByNumber.set(key, o.id);
    });

    const paymentModeByName = new Map();
    paymentModes.forEach((m) => {
        const key = (m.name || "").toString().toLowerCase().trim();
        if (key && !paymentModeByName.has(key)) paymentModeByName.set(key, m.id);
    });

    const bankByName = new Map();
    banks.forEach((b) => {
        const key = (b.name || "").toString().toLowerCase().trim();
        if (key && !bankByName.has(key)) bankByName.set(key, b.id);
    });

    const userByName = new Map();
    users.forEach((u) => {
        const key = (u.name || "").toString().toLowerCase().trim();
        if (key && !userByName.has(key)) userByName.set(key, u.id);
    });

    const defaultCompanyBankAccountId = companyBankAccounts[0]?.id ?? null;

    return {
        orderByNumber,
        paymentModeByName,
        bankByName,
        userByName,
        defaultCompanyBankAccountId,
    };
}

async function processRow(row, refs, dryRun, errorsOut, createdRows, skippedRows, proofErrorsOut, rowNum) {
    const pui = trim(row.PUI);
    if (!pui) {
        errorsOut.push({ row: rowNum, pui: "", error: "PUI is required" });
        return { ok: false, skipped: false, proofUploaded: false };
    }

    const orderId = refs.orderByNumber.get(pui);
    if (orderId == null) {
        errorsOut.push({ row: rowNum, pui, error: `Order not found for PUI: ${pui}` });
        return { ok: false, skipped: true, proofUploaded: false };
    }

    const paymentDateStr = parseDate(row["Payment Date"]);
    const dateOfPayment = paymentDateStr ? new Date(paymentDateStr + "T12:00:00.000Z") : null;
    if (!dateOfPayment) {
        errorsOut.push({ row: rowNum, pui, error: "Invalid or missing Payment Date" });
        return { ok: false, skipped: false, proofUploaded: false };
    }

    const amount = parseFloatSafe(row.Amount);
    if (amount == null || amount <= 0) {
        errorsOut.push({ row: rowNum, pui, error: "Invalid or missing Amount" });
        return { ok: false, skipped: false, proofUploaded: false };
    }

    const modeStr = trim(row.Mode);
    const paymentModeId = modeStr ? refs.paymentModeByName.get(modeStr.toLowerCase()) : null;
    if (paymentModeId == null) {
        errorsOut.push({ row: rowNum, pui, error: `Payment mode not found: "${modeStr}"` });
        return { ok: false, skipped: false, proofUploaded: false };
    }

    if (refs.defaultCompanyBankAccountId == null) {
        errorsOut.push({ row: rowNum, pui, error: "No company bank account configured" });
        return { ok: false, skipped: false, proofUploaded: false };
    }

    const bankName = trim(row["Bank Name"]);
    const bankId = bankName ? refs.bankByName.get(bankName.toLowerCase()) ?? null : null;

    const auditStatus = mapAuditStatus(row["Audit Status"] || "");
    const auditOn = parseDateObject(row["Audit On"]);
    const auditByStr = trim(row["Audit By"]);
    const auditByUserId = auditByStr ? refs.userByName.get(auditByStr.toLowerCase()) ?? null : null;
    const auditRemarks = trim(row["Audit Remarks"]) || null;
    const paymentProofUrl = trim(row["Payment Proof URL"]) || null;

    if (dryRun) {
        createdRows.push({ row: rowNum, pui, order_id: orderId, amount, payment_date: paymentDateStr });
        return { ok: true, skipped: false, dryRun: true, proofUploaded: false };
    }

    const t = await db.sequelize.transaction();
    try {
        const existing = await OrderPaymentDetail.findOne({
            where: {
                order_id: orderId,
                date_of_payment: dateOfPayment,
                payment_amount: amount,
                deleted_at: null,
            },
            transaction: t,
        });
        if (existing) {
            skippedRows.push({ row: rowNum, pui, order_id: orderId, reason: "Duplicate (order_id + date + amount)" });
            await t.commit();
            return { ok: true, skipped: true, proofUploaded: false };
        }

        let receiptChequeFile = null;
        if (paymentProofUrl) {
            try {
                const path = await fetchAndUploadProof(paymentProofUrl);
                receiptChequeFile = path || null;
                if (!path && paymentProofUrl) {
                    proofErrorsOut.push({ row: rowNum, pui, error: "Proof fetch/upload returned no path" });
                }
            } catch (err) {
                proofErrorsOut.push({ row: rowNum, pui, error: `Proof upload: ${err.message || String(err)}` });
            }
        }

        const payload = {
            order_id: orderId,
            date_of_payment: dateOfPayment,
            payment_amount: amount,
            payment_mode_id: paymentModeId,
            company_bank_account_id: refs.defaultCompanyBankAccountId,
            transaction_cheque_date: parseDate(row["Cheque Date"]) ? new Date(parseDate(row["Cheque Date"]) + "T12:00:00.000Z") : null,
            transaction_cheque_number: trim(row["Cheque No"]) || null,
            bank_id: bankId,
            payment_remarks: trim(row.Remarks) || null,
            receipt_cheque_file: receiptChequeFile,
            status: auditStatus,
        };

        if (auditStatus === "approved") {
            payload.approved_at = auditOn || new Date();
            payload.approved_by = auditByUserId;
        } else if (auditStatus === "rejected") {
            payload.rejected_at = auditOn || new Date();
            payload.rejected_by = auditByUserId;
            payload.rejection_reason = auditRemarks;
        }

        const created = await OrderPaymentDetail.create(payload, { transaction: t });
        await t.commit();
        createdRows.push({
            row: rowNum,
            pui,
            order_id: orderId,
            payment_id: created.id,
            amount: created.payment_amount,
        });
        return { ok: true, skipped: false, paymentId: created.id, proofUploaded: !!receiptChequeFile };
    } catch (err) {
        await t.rollback();
        errorsOut.push({
            row: rowNum,
            pui,
            error: err.message || String(err),
        });
        return { ok: false, skipped: false, proofUploaded: false };
    }
}

/**
 * Proofs-only mode: find existing OrderPaymentDetail by (order_id, date_of_payment, payment_amount),
 * fetch Payment Proof URL, upload to bucket, update receipt_cheque_file.
 */
async function processRowProofsOnly(row, refs, dryRun, errorsOut, skippedRows, proofUpdatedRows, proofErrorsOut, rowNum) {
    const pui = trim(row.PUI);
    const paymentProofUrl = trim(row["Payment Proof URL"]) || null;

    if (!pui) {
        skippedRows.push({ row: rowNum, pui: "", reason: "PUI is required" });
        return { ok: true, skipped: true };
    }
    if (!paymentProofUrl || !paymentProofUrl.startsWith("http")) {
        skippedRows.push({ row: rowNum, pui, reason: "No Payment Proof URL" });
        return { ok: true, skipped: true };
    }

    const orderId = refs.orderByNumber.get(pui);
    if (orderId == null) {
        skippedRows.push({ row: rowNum, pui, reason: `Order not found for PUI: ${pui}` });
        return { ok: true, skipped: true };
    }

    const paymentDateStr = parseDate(row["Payment Date"]);
    const dateOfPayment = paymentDateStr ? new Date(paymentDateStr + "T12:00:00.000Z") : null;
    if (!dateOfPayment) {
        skippedRows.push({ row: rowNum, pui, reason: "Invalid or missing Payment Date" });
        return { ok: true, skipped: true };
    }

    const amount = parseFloatSafe(row.Amount);
    if (amount == null || amount <= 0) {
        skippedRows.push({ row: rowNum, pui, reason: "Invalid or missing Amount" });
        return { ok: true, skipped: true };
    }

    const existing = await OrderPaymentDetail.findOne({
        where: {
            order_id: orderId,
            date_of_payment: dateOfPayment,
            payment_amount: amount,
            deleted_at: null,
        },
    });
    if (!existing) {
        skippedRows.push({ row: rowNum, pui, reason: "No matching payment (order_id + date + amount)" });
        return { ok: true, skipped: true };
    }

    if (dryRun) {
        proofUpdatedRows.push({ row: rowNum, pui, order_id: orderId, payment_id: existing.id, dryRun: true });
        return { ok: true, skipped: false };
    }

    let bucketPath;
    try {
        const result = await fetchAndUploadProof(paymentProofUrl);
        bucketPath = result;
    } catch (err) {
        proofErrorsOut.push({ row: rowNum, pui, error: `Proof upload: ${err.message || String(err)}` });
        errorsOut.push({ row: rowNum, pui, error: `Proof upload: ${err.message || String(err)}` });
        return { ok: false, skipped: false };
    }

    if (!bucketPath) {
        proofErrorsOut.push({ row: rowNum, pui, error: "Proof fetch/upload returned no path" });
        return { ok: false, skipped: false };
    }

    try {
        await existing.update({ receipt_cheque_file: bucketPath });
        proofUpdatedRows.push({ row: rowNum, pui, order_id: orderId, payment_id: existing.id });
        return { ok: true, skipped: false };
    } catch (err) {
        errorsOut.push({ row: rowNum, pui, error: err.message || String(err) });
        return { ok: false, skipped: false };
    }
}

function escapeCsv(value) {
    if (value == null) return "";
    const s = String(value);
    if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function writeResultCsv(errors, createdRows, skippedRows, outputPath, proofErrors = [], proofUpdatedRows = []) {
    const headers = [
        "section",
        "row",
        "pui",
        "order_id",
        "payment_id",
        "amount",
        "error",
        "reason",
    ];

    const lines = [];
    lines.push(headers.join(","));

    (errors || []).forEach((e) => {
        const row = {
            section: "error",
            row: e.row,
            pui: e.pui || "",
            order_id: "",
            payment_id: "",
            amount: "",
            error: e.error || "",
            reason: "",
        };
        lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
    });

    (proofErrors || []).forEach((e) => {
        const row = {
            section: "proof_error",
            row: e.row,
            pui: e.pui || "",
            order_id: "",
            payment_id: "",
            amount: "",
            error: e.error || "",
            reason: "",
        };
        lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
    });

    (createdRows || []).forEach((r) => {
        const row = {
            section: "created",
            row: r.row,
            pui: r.pui || "",
            order_id: r.order_id ?? "",
            payment_id: r.payment_id ?? "",
            amount: r.amount ?? "",
            error: "",
            reason: "",
        };
        lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
    });

    (proofUpdatedRows || []).forEach((r) => {
        const row = {
            section: "proof_updated",
            row: r.row,
            pui: r.pui || "",
            order_id: r.order_id ?? "",
            payment_id: r.payment_id ?? "",
            amount: "",
            error: "",
            reason: "",
        };
        lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
    });

    (skippedRows || []).forEach((r) => {
        const row = {
            section: "skipped",
            row: r.row,
            pui: r.pui || "",
            order_id: r.order_id ?? "",
            payment_id: "",
            amount: "",
            error: "",
            reason: r.reason || "",
        };
        lines.push(headers.map((h) => escapeCsv(row[h])).join(","));
    });

    fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
}

async function main() {
    const args = process.argv.slice(2);
    let filePath = null;
    let dryRun = false;
    let proofsOnly = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--file" && args[i + 1]) {
            filePath = args[++i];
        } else if (args[i] === "--dry-run") {
            dryRun = true;
        } else if (args[i] === "--proofs-only") {
            proofsOnly = true;
        }
    }

    if (!filePath) {
        console.error("Usage: node scripts/payment-import/import-payments.js --file <path> [--dry-run] [--proofs-only]");
        process.exit(1);
    }

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
        console.error("File not found:", resolvedPath);
        process.exit(1);
    }

    console.log(proofsOnly ? "Payment Import (proofs-only)" : "Payment Import");
    if (dryRun) console.log("DRY RUN – no changes will be written.\n");

    const errors = [];
    const createdRows = [];
    const skippedRows = [];
    const proofErrors = [];
    const proofUpdatedRows = [];
    let total = 0;
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let proofsUploaded = 0;
    let proofsAttached = 0;

    const refs = await resolveReferences();
    if (!proofsOnly && refs.defaultCompanyBankAccountId == null && !dryRun) {
        console.error("No company bank account found. Create at least one active company bank account.");
        process.exit(1);
    }

    if (!dryRun) {
        try {
            bucketService.getClient();
        } catch (e) {
            if (e.code === "BUCKET_CONFIG_MISSING") {
                console.error("Bucket config missing (BUCKET_* env). Required for payment proof upload.");
                process.exit(1);
            }
        }
    }

    console.log("Processing:", resolvedPath);

    let content;
    try {
        content = fs.readFileSync(resolvedPath, "utf8");
    } catch (e) {
        console.error("Read error:", e.message);
        process.exit(1);
    }

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
        process.exit(1);
    }

    if (proofsOnly) {
        for (let i = 0; i < rows.length; i++) {
            const rowNum = i + 2;
            total++;
            const result = await processRowProofsOnly(
                rows[i],
                refs,
                dryRun,
                errors,
                skippedRows,
                proofUpdatedRows,
                proofErrors,
                rowNum
            );
            if (result.skipped) {
                skipped++;
            } else if (result.ok) {
                if (!result.dryRun) proofsAttached++;
            } else {
                failed++;
            }
        }
        console.log("\n--- Summary (proofs-only) ---");
        console.log("Total rows:", total);
        console.log("Proofs attached:", proofsAttached);
        console.log("Skipped (no match / no URL):", skipped);
        console.log("Failed:", failed);
        if (proofErrors.length) console.log("Proof errors:", proofErrors.length);
    } else {
        for (let i = 0; i < rows.length; i++) {
            const rowNum = i + 2;
            total++;
            const result = await processRow(
                rows[i],
                refs,
                dryRun,
                errors,
                createdRows,
                skippedRows,
                proofErrors,
                rowNum
            );
            if (result.skipped) {
                skipped++;
            } else if (result.ok) {
                if (!result.dryRun) {
                    created++;
                    if (result.proofUploaded) proofsUploaded++;
                }
            } else {
                failed++;
            }
        }
        console.log("\n--- Summary ---");
        console.log("Total rows:", total);
        console.log("Created:", created);
        console.log("Proofs uploaded (with created):", proofsUploaded);
        console.log("Skipped (no order or duplicate):", skipped);
        console.log("Failed:", failed);
        if (proofErrors.length) console.log("Proof errors:", proofErrors.length);
    }

    const inputDir = path.dirname(resolvedPath);
    const resultPath = path.join(inputDir, "payment-import-result.csv");
    writeResultCsv(errors, createdRows, skippedRows, resultPath, proofErrors, proofUpdatedRows);
    console.log("Result CSV file (errors, created, skipped, proof_error, proof_updated):", resultPath);

    await db.sequelize.close();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
