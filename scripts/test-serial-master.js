/* eslint-disable no-console */
/**
 * Dynamic Serial Master — Comprehensive Test Script
 *
 * Tests all serial generation scenarios including:
 * 1.  FIXED only
 * 2.  DATE formats (DD, MM, YY, YYYY, Mmm, MMM)
 * 3.  SERIAL increment
 * 4.  SERIAL reset on value boundary
 * 5.  Composite (FIXED + DATE + SERIAL)
 * 6.  FINANCIAL_YEAR formats
 * 7.  SEQUENTIALCHARACTER increment
 * 8.  Full combo (all types together)
 * 9.  Interval-based reset (MONTHLY)
 * 10. CRUD operations
 * 11. Concurrent generation (no duplicates)
 * 12. Edge cases (missing code, inactive, empty details)
 *
 * Usage: node scripts/test-serial-master.js
 */

const dotenv = require("dotenv");
dotenv.config();

const db = require("../src/models/index.js");
const serialMasterService = require("../src/modules/serialMaster/serialMaster.service.js");

const TEST_PREFIX = "__TEST_SM_";
let testCount = 0;
let passCount = 0;
let failCount = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function runTest(name, fn) {
    testCount++;
    const label = `[${testCount}] ${name}`;
    try {
        await fn();
        passCount++;
        console.log(`  ✅ ${label}`);
    } catch (err) {
        failCount++;
        console.error(`  ❌ ${label}`);
        console.error(`     Error: ${err.message}`);
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(
            `${message || "Assertion failed"}: expected "${expected}", got "${actual}"`
        );
    }
}

function assertStartsWith(actual, prefix, message) {
    if (!actual || !actual.startsWith(prefix)) {
        throw new Error(
            `${message || "Assertion failed"}: expected "${actual}" to start with "${prefix}"`
        );
    }
}

async function cleanupTestData() {
    const SerialMaster = db.SerialMaster;
    const SerialMasterDetail = db.SerialMasterDetail;
    if (!SerialMaster || !SerialMasterDetail) return;

    // Find all test masters (including soft-deleted)
    const masters = await SerialMaster.findAll({
        where: { code: { [db.Sequelize.Op.like]: `${TEST_PREFIX}%` } },
        paranoid: false,
    });

    for (const m of masters) {
        await SerialMasterDetail.destroy({ where: { serial_master_id: m.id }, force: true });
        await m.destroy({ force: true });
    }
}

// ── Test Scenarios ───────────────────────────────────────────────────────────

async function test01_fixedOnly() {
    const code = `${TEST_PREFIX}FIXED`;
    await serialMasterService.createSerial({
        code,
        details: [{ type: "FIXED", fixed_char: "INV-" }],
    });

    const r1 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r1.result, "INV-", "Fixed-only should produce exact string");

    const r2 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r2.result, "INV-", "Fixed-only should always produce same string");
}

async function test02_dateFormats() {
    const now = new Date();
    const MONTHS_SHORT = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const formats = [
        { fmt: "DD", expected: String(now.getDate()).padStart(2, "0") },
        { fmt: "MM", expected: String(now.getMonth() + 1).padStart(2, "0") },
        { fmt: "YY", expected: String(now.getFullYear()).slice(-2) },
        { fmt: "YYYY", expected: String(now.getFullYear()) },
        { fmt: "Mmm", expected: MONTHS_SHORT[now.getMonth()] },
        { fmt: "MMM", expected: MONTHS_SHORT[now.getMonth()].toUpperCase() },
    ];

    for (const { fmt, expected } of formats) {
        const code = `${TEST_PREFIX}DATE_${fmt}`;
        await serialMasterService.createSerial({
            code,
            details: [{ type: "DATE", date_format: fmt }],
        });

        const r = await serialMasterService.generateSerialByCode(code);
        assertEqual(r.result, expected, `DATE format ${fmt}`);
    }
}

async function test03_serialIncrement() {
    const code = `${TEST_PREFIX}SERINC`;
    await serialMasterService.createSerial({
        code,
        details: [
            {
                type: "SERIAL",
                width: 4,
                start_value: "0",
                next_value: 1,
                last_generated: "0000",
                reset_value: "9999",
            },
        ],
    });

    const r1 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r1.result, "0001", "First serial should be 0001");

    const r2 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r2.result, "0002", "Second serial should be 0002");

    const r3 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r3.result, "0003", "Third serial should be 0003");
}

async function test04_serialReset() {
    const code = `${TEST_PREFIX}SERRST`;
    await serialMasterService.createSerial({
        code,
        details: [
            {
                type: "SERIAL",
                width: 2,
                start_value: "0",
                next_value: 1,
                last_generated: "97",
                reset_value: "99",
            },
        ],
    });

    const r1 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r1.result, "98", "Should be 98");

    const r2 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r2.result, "99", "Should be 99");

    // Next call should reset (100 > 99, so resets to start_value)
    const r3 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r3.result, "00", "Should reset to 00 (start_value) after exceeding 99");
}

async function test05_composite() {
    const code = `${TEST_PREFIX}COMP`;
    const now = new Date();
    const yyyy = String(now.getFullYear());

    await serialMasterService.createSerial({
        code,
        details: [
            { type: "FIXED", fixed_char: "PO-", sort_order: 0 },
            { type: "DATE", date_format: "YYYY", sort_order: 1 },
            { type: "FIXED", fixed_char: "/", sort_order: 2 },
            {
                type: "SERIAL",
                width: 4,
                start_value: "0",
                next_value: 1,
                last_generated: "0000",
                reset_value: "9999",
                sort_order: 3,
            },
        ],
    });

    const r1 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r1.result, `PO-${yyyy}/0001`, "Composite serial #1");

    const r2 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r2.result, `PO-${yyyy}/0002`, "Composite serial #2");
}

async function test06_financialYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startYear = month >= 4 ? year : year - 1;
    const endYear = startYear + 1;
    const yyyy = startYear.toString();
    const YYYY = endYear.toString();
    const yy = yyyy.slice(2);
    const YY = YYYY.slice(2);

    const formats = [
        { fmt: "yyyy-YY", expected: `${yyyy}-${YY}` },
        { fmt: "yyyy/YY", expected: `${yyyy}/${YY}` },
        { fmt: "yyyyYY", expected: `${yyyy}${YY}` },
        { fmt: "yy-YY", expected: `${yy}-${YY}` },
        { fmt: "yy/YY", expected: `${yy}/${YY}` },
        { fmt: "yyYY", expected: `${yy}${YY}` },
    ];

    for (let i = 0; i < formats.length; i++) {
        const { fmt, expected } = formats[i];
        const code = `${TEST_PREFIX}FY${i}`;
        await serialMasterService.createSerial({
            code,
            details: [{ type: "FINANCIAL_YEAR", date_format: fmt }],
        });

        const r = await serialMasterService.generateSerialByCode(code);
        assertEqual(r.result, expected, `FINANCIAL_YEAR format ${fmt}`);
    }
}

async function test07_sequentialCharacter() {
    const code = `${TEST_PREFIX}SEQCHAR`;
    await serialMasterService.createSerial({
        code,
        details: [
            {
                type: "SEQUENTIALCHARACTER",
                fixed_char: "A",
                last_generated: "A",
            },
        ],
    });

    // When all segments are SEQCHAR, it increments every call
    const r1 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r1.result, "B", "SEQCHAR should increment A to B");

    const r2 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r2.result, "C", "SEQCHAR should increment B to C");

    // Test Z rollover
    const code2 = `${TEST_PREFIX}SEQCHAR_Z`;
    await serialMasterService.createSerial({
        code: code2,
        details: [
            {
                type: "SEQUENTIALCHARACTER",
                fixed_char: "A",
                last_generated: "Z",
            },
        ],
    });

    const rz = await serialMasterService.generateSerialByCode(code2);
    assertEqual(rz.result, "AA", "SEQCHAR should roll Z to AA");
}

async function test08_fullCombo() {
    const code = `${TEST_PREFIX}FULLCOMBO`;
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");

    await serialMasterService.createSerial({
        code,
        details: [
            { type: "FIXED", fixed_char: "SO/", sort_order: 0 },
            { type: "DATE", date_format: "YYYY", sort_order: 1 },
            { type: "DATE", date_format: "MM", sort_order: 2 },
            { type: "FIXED", fixed_char: "-", sort_order: 3 },
            {
                type: "SERIAL",
                width: 3,
                start_value: "0",
                next_value: 1,
                last_generated: "000",
                reset_value: "999",
                sort_order: 4,
            },
        ],
    });

    const r1 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r1.result, `SO/${yyyy}${mm}-001`, "Full combo #1");

    const r2 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r2.result, `SO/${yyyy}${mm}-002`, "Full combo #2");
}

async function test09_intervalReset() {
    const code = `${TEST_PREFIX}INTRST`;
    const SerialMasterDetail = db.SerialMasterDetail;

    await serialMasterService.createSerial({
        code,
        details: [
            {
                type: "SERIAL",
                width: 3,
                start_value: "0",
                next_value: 1,
                last_generated: "005",
                reset_value: "999",
                reset_interval: "MONTHLY",
            },
        ],
    });

    // Generate normally (should be 006)
    const r1 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r1.result, "006", "Should increment to 006");

    // Simulate a month change by updating last_reset_at to last month
    const master = await db.SerialMaster.findOne({ where: { code } });
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    await SerialMasterDetail.update(
        { last_reset_at: lastMonth },
        { where: { serial_master_id: master.id } }
    );

    // Now generate — should reset to start_value
    const r2 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r2.result, "000", "Should reset to 000 (start_value) after month change");
}

async function test10_crudOperations() {
    const code = `${TEST_PREFIX}CRUD`;

    // Create
    const created = await serialMasterService.createSerial({
        code,
        is_active: true,
        details: [
            { type: "FIXED", fixed_char: "TST-" },
            { type: "SERIAL", width: 3, start_value: "0", next_value: 1, last_generated: "000", reset_value: "999" },
        ],
    });
    assert(created.id, "Create should return an ID");
    assertEqual(created.code, code, "Create should set code");
    assert(created.details.length === 2, "Create should have 2 details");

    // Read
    const fetched = await serialMasterService.getSerialById(created.id);
    assertEqual(fetched.code, code, "Read should return correct code");

    // Update
    const updated = await serialMasterService.updateSerial(created.id, {
        code: `${code}_UPD`,
        details: [
            { type: "FIXED", fixed_char: "UPD-" },
        ],
    });
    assertEqual(updated.code, `${code}_UPD`, "Update should change code");
    assert(updated.details.length === 1, "Update should replace details");

    // List
    const list = await serialMasterService.getSerialList({ q: TEST_PREFIX });
    assert(list.data.length > 0, "List should return results");
    assert(list.meta.total > 0, "List should have total count");

    // Delete
    await serialMasterService.deleteSerial(created.id);
    try {
        await serialMasterService.getSerialById(created.id);
        throw new Error("Should have thrown 404");
    } catch (err) {
        assert(err.statusCode === 404 || err.message.includes("not found"), "Delete should soft-remove");
    }
}

async function test11_concurrentGeneration() {
    const code = `${TEST_PREFIX}CONC`;
    await serialMasterService.createSerial({
        code,
        details: [
            {
                type: "SERIAL",
                width: 4,
                start_value: "0",
                next_value: 1,
                last_generated: "0000",
                reset_value: "9999",
            },
        ],
    });

    // Fire 10 concurrent generate calls
    const promises = Array.from({ length: 10 }, () =>
        serialMasterService.generateSerialByCode(code)
    );

    const results = await Promise.all(promises);
    const serials = results.map((r) => r.result);

    // All should be unique
    const uniqueSerials = new Set(serials);
    assertEqual(
        uniqueSerials.size,
        serials.length,
        `Concurrent: all ${serials.length} serials should be unique. Got: ${serials.join(", ")}`
    );

    // Should be sequential 1–10
    const nums = serials.map((s) => parseInt(s, 10)).sort((a, b) => a - b);
    for (let i = 0; i < nums.length; i++) {
        assertEqual(nums[i], i + 1, `Concurrent serial ${i + 1}`);
    }
}

async function test12_edgeCases() {
    // Missing code
    const r1 = await serialMasterService.generateSerialByCode(`${TEST_PREFIX}NONEXISTENT`);
    assertEqual(r1.status, false, "Missing code should fail");

    // Inactive serial
    const code = `${TEST_PREFIX}INACTIVE`;
    await serialMasterService.createSerial({
        code,
        is_active: false,
        details: [{ type: "FIXED", fixed_char: "X" }],
    });
    const r2 = await serialMasterService.generateSerialByCode(code);
    assertEqual(r2.status, false, "Inactive serial should fail");

    // Duplicate code
    const dupCode = `${TEST_PREFIX}DUP`;
    await serialMasterService.createSerial({
        code: dupCode,
        details: [{ type: "FIXED", fixed_char: "Y" }],
    });
    try {
        await serialMasterService.createSerial({
            code: dupCode,
            details: [{ type: "FIXED", fixed_char: "Z" }],
        });
        throw new Error("Should have thrown duplicate error");
    } catch (err) {
        assert(
            err.message.includes("already exists") || err.statusCode === 400,
            "Duplicate code should be rejected"
        );
    }
}

// ── Main Runner ──────────────────────────────────────────────────────────────

async function main() {
    console.log("═══════════════════════════════════════════════════════════");
    console.log(" Dynamic Serial Master — Test Suite");
    console.log("═══════════════════════════════════════════════════════════\n");

    try {
        // Ensure DB connection
        await db.sequelize.authenticate();
        console.log("  ✅ Database connected\n");

        // Ensure tables exist (run sync for test models only)
        await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS serial_masters (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ,
        created_by INTEGER,
        updated_by INTEGER
      );
    `);
        await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS serial_master_details (
        id SERIAL PRIMARY KEY,
        serial_master_id INTEGER NOT NULL REFERENCES serial_masters(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        type VARCHAR(30) NOT NULL,
        fixed_char VARCHAR(100),
        date_format VARCHAR(20),
        width INTEGER,
        start_value VARCHAR(50),
        next_value INTEGER DEFAULT 1,
        reset_value VARCHAR(50),
        last_generated VARCHAR(50),
        reset_interval VARCHAR(10),
        last_reset_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER
      );
    `);
        await db.sequelize.query(`
      CREATE INDEX IF NOT EXISTS serial_master_details_master_sort_idx
        ON serial_master_details (serial_master_id, sort_order);
    `);
        console.log("  ✅ Tables ensured\n");

        // Cleanup any leftover test data
        await cleanupTestData();

        console.log("Running tests...\n");

        // ── Scenario Tests ──
        console.log("── Scenario 1: FIXED only ──");
        await runTest("FIXED-only generates literal string", test01_fixedOnly);

        console.log("\n── Scenario 2: DATE formats ──");
        await runTest("All DATE formats produce correct segments", test02_dateFormats);

        console.log("\n── Scenario 3: SERIAL increment ──");
        await runTest("SERIAL increments correctly", test03_serialIncrement);

        console.log("\n── Scenario 4: SERIAL reset on value boundary ──");
        await runTest("SERIAL resets when exceeding reset_value", test04_serialReset);

        console.log("\n── Scenario 5: Composite (FIXED + DATE + SERIAL) ──");
        await runTest("Composite serial generates correctly", test05_composite);

        console.log("\n── Scenario 6: FINANCIAL_YEAR formats ──");
        await runTest("All FINANCIAL_YEAR formats produce correct FY strings", test06_financialYear);

        console.log("\n── Scenario 7: SEQUENTIALCHARACTER ──");
        await runTest("SEQUENTIALCHARACTER increments A→B→C and Z→AA", test07_sequentialCharacter);

        console.log("\n── Scenario 8: Full combo (all types) ──");
        await runTest("Full combo with FIXED + DATE + SERIAL", test08_fullCombo);

        console.log("\n── Scenario 9: Interval-based reset (MONTHLY) ──");
        await runTest("MONTHLY reset triggers on month boundary", test09_intervalReset);

        console.log("\n── Scenario 10: CRUD operations ──");
        await runTest("Create, Read, Update, List, Delete work correctly", test10_crudOperations);

        console.log("\n── Scenario 11: Concurrent generation ──");
        await runTest("10 parallel generates produce unique sequential values", test11_concurrentGeneration);

        console.log("\n── Scenario 12: Edge cases ──");
        await runTest("Missing code, inactive serial, duplicate code", test12_edgeCases);

    } catch (err) {
        console.error("\n💥 FATAL ERROR:", err.message);
        console.error(err.stack);
    } finally {
        // Cleanup
        try {
            await cleanupTestData();
            console.log("\n  🧹 Test data cleaned up");
        } catch (err) {
            console.error("  ⚠️  Cleanup error:", err.message);
        }

        // Summary
        console.log("\n═══════════════════════════════════════════════════════════");
        console.log(` RESULTS: ${passCount} passed, ${failCount} failed, ${testCount} total`);
        console.log("═══════════════════════════════════════════════════════════\n");

        if (failCount > 0) {
            process.exitCode = 1;
        }

        try {
            await db.sequelize.close();
        } catch (_) { /* ignore */ }
    }
}

main();
