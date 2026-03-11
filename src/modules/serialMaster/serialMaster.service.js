"use strict";

const { Op } = require("sequelize");
const AppError = require("../../common/errors/AppError.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format date segment based on format string.
 * Supported: DD, MM, YY, YYYY, Mmm, MMM
 */
function formatDateSegment(format) {
    const date = new Date();
    const MONTHS_SHORT = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    switch (format) {
        case "DD":
            return String(date.getDate()).padStart(2, "0");
        case "MM":
            return String(date.getMonth() + 1).padStart(2, "0");
        case "YY":
            return String(date.getFullYear()).toString().slice(-2);
        case "YYYY":
            return String(date.getFullYear());
        case "Mmm":
            return MONTHS_SHORT[date.getMonth()];
        case "MMM":
            return MONTHS_SHORT[date.getMonth()].toUpperCase();
        default:
            return "";
    }
}

/**
 * Get financial year string based on format.
 * FY starts in April. Supported formats:
 * yyyy-YY, yyyy/YY, yyyyYY, yy-YY, yy/YY, yyYY
 */
function getFinancialYear(format) {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Jan = 1
    const startYear = month >= 4 ? year : year - 1;
    const endYear = startYear + 1;
    const yyyy = startYear.toString();
    const YYYY = endYear.toString();
    const yy = yyyy.slice(2);
    const YY = YYYY.slice(2);

    switch (format) {
        case "yyyy-YY": return `${yyyy}-${YY}`;
        case "yyyy/YY": return `${yyyy}/${YY}`;
        case "yyyyYY": return `${yyyy}${YY}`;
        case "yy-YY": return `${yy}-${YY}`;
        case "yy/YY": return `${yy}/${YY}`;
        case "yyYY": return `${yy}${YY}`;
        default: return "";
    }
}

/**
 * Increment alphabetic sequential character.
 * A → B, Z → AA, AZ → BA, ZZ → AAA
 */
function incrementAlphaSequence(current) {
    if (!current) return "A";
    const chars = current.split("");
    let i = chars.length - 1;

    while (i >= 0) {
        chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
        if (chars[i] > "Z") {
            chars[i] = "A";
            i--;
        } else {
            break;
        }
    }

    // All positions overflowed → add leading A
    if (i < 0) {
        chars.unshift("A");
    }

    return chars.join("");
}

/**
 * Check if a SERIAL-type detail needs an interval-based reset.
 * Returns true if the detail's reset_interval applies and the period has changed.
 */
function shouldResetByInterval(detail) {
    if (!detail.reset_interval || !detail.last_reset_at) return false;

    const now = new Date();
    const lastReset = new Date(detail.last_reset_at);

    switch (detail.reset_interval) {
        case "DAILY":
            return now.toDateString() !== lastReset.toDateString();
        case "MONTHLY":
            return (
                now.getMonth() !== lastReset.getMonth() ||
                now.getFullYear() !== lastReset.getFullYear()
            );
        case "YEARLY":
            return now.getFullYear() !== lastReset.getFullYear();
        default:
            return false;
    }
}

// ─── Core Generation ────────────────────────────────────────────────────────

/**
 * Generate the next serial number for a given serial master code.
 * Multi-tenant: uses getTenantModels() to access tenant-scoped DB.
 *
 * @param {string} code - The serial master code (e.g. "PO", "SO", "INV")
 * @param {Object} [options] - Options
 * @param {import("sequelize").Transaction} [options.transaction] - Optional external transaction
 * @returns {Promise<{status: boolean, message: string, result: string|null}>}
 */
async function generateSerialByCode(code, options = {}) {
    const models = getTenantModels();
    const { SerialMaster, SerialMasterDetail, sequelize } = models;

    if (!SerialMaster || !SerialMasterDetail) {
        return { status: false, message: "Serial Master models not loaded", result: null };
    }

    // Use provided transaction or create a new one
    const shouldManageTransaction = !options.transaction;
    const transaction = options.transaction || (await sequelize.transaction());

    try {
        // Lock the master row first (no eager-loading to avoid FOR UPDATE outer-join issue)
        const master = await SerialMaster.findOne({
            where: { code, is_active: true },
            lock: transaction.LOCK.UPDATE,
            transaction,
        });

        if (!master) {
            if (shouldManageTransaction) await transaction.rollback();
            return { status: false, message: `Serial code "${code}" not found or inactive`, result: null };
        }

        // Fetch and lock detail rows separately
        const details = await SerialMasterDetail.findAll({
            where: { serial_master_id: master.id },
            order: [["sort_order", "ASC"]],
            lock: transaction.LOCK.UPDATE,
            transaction,
        });

        if (details.length === 0) {
            if (shouldManageTransaction) await transaction.rollback();
            return { status: false, message: `Serial code "${code}" has no detail segments`, result: null };
        }

        let serialNumber = "";
        const detailUpdates = []; // collect updates for batch save

        // ── Check if SEQUENTIALCHARACTER needs incrementing ──
        let shouldIncrementSeqChar = false;
        const hasSeqChar = details.some((d) => d.type === "SEQUENTIALCHARACTER");

        if (hasSeqChar) {
            const allAreSeqChar = details.every((d) => d.type === "SEQUENTIALCHARACTER");
            const anySerialAtReset = details.some(
                (d) => d.type === "SERIAL" && d.last_generated === d.reset_value
            );
            shouldIncrementSeqChar = allAreSeqChar || anySerialAtReset;
        }

        // ── Process each detail ──
        for (const detail of details) {
            switch (detail.type) {
                case "FIXED": {
                    if (!detail.fixed_char) {
                        if (shouldManageTransaction) await transaction.rollback();
                        return { status: false, message: "FIXED segment missing fixed_char", result: null };
                    }
                    serialNumber += detail.fixed_char;
                    break;
                }

                case "DATE": {
                    if (!detail.date_format) {
                        if (shouldManageTransaction) await transaction.rollback();
                        return { status: false, message: "DATE segment missing date_format", result: null };
                    }
                    serialNumber += formatDateSegment(detail.date_format);
                    break;
                }

                case "FINANCIAL_YEAR": {
                    if (!detail.date_format) {
                        if (shouldManageTransaction) await transaction.rollback();
                        return { status: false, message: "FINANCIAL_YEAR segment missing date_format", result: null };
                    }
                    serialNumber += getFinancialYear(detail.date_format);
                    break;
                }

                case "SERIAL": {
                    if (!detail.width) {
                        if (shouldManageTransaction) await transaction.rollback();
                        return { status: false, message: "SERIAL segment missing width", result: null };
                    }

                    const nextStep = detail.next_value || 1;
                    const resetVal = detail.reset_value ? parseInt(detail.reset_value, 10) : null;
                    const startVal = parseInt(detail.start_value || "0", 10);
                    let currentNum;

                    if (detail.last_generated === null || detail.last_generated === undefined || detail.last_generated === "") {
                        // First-ever generation: start from start_value directly
                        currentNum = startVal;
                    } else {
                        currentNum = parseInt(detail.last_generated, 10);

                        // Check interval-based reset
                        if (detail.reset_interval && shouldResetByInterval(detail)) {
                            currentNum = startVal;
                            detail.last_reset_at = new Date();
                        } else {
                            // Normal increment from last generated
                            currentNum += nextStep;
                        }
                    }

                    // Check value-based reset
                    if (resetVal !== null && currentNum > resetVal) {
                        currentNum = startVal;
                        detail.last_reset_at = new Date();
                    }

                    const formatted = String(currentNum).padStart(detail.width, "0");
                    serialNumber += formatted;

                    detailUpdates.push({
                        id: detail.id,
                        last_generated: formatted,
                        last_reset_at: detail.last_reset_at || detail.getDataValue("last_reset_at"),
                    });
                    break;
                }

                case "SEQUENTIALCHARACTER": {
                    let currentChar = detail.last_generated || detail.fixed_char || "A";

                    if (shouldIncrementSeqChar) {
                        currentChar = incrementAlphaSequence(currentChar);
                    }

                    serialNumber += currentChar;

                    detailUpdates.push({
                        id: detail.id,
                        last_generated: currentChar,
                    });
                    break;
                }

                default: {
                    if (shouldManageTransaction) await transaction.rollback();
                    return { status: false, message: `Unknown serial type: ${detail.type}`, result: null };
                }
            }
        }

        // ── Batch update modified details ──
        for (const upd of detailUpdates) {
            const updateData = { last_generated: upd.last_generated };
            if (upd.last_reset_at) {
                updateData.last_reset_at = upd.last_reset_at;
            }
            await SerialMasterDetail.update(updateData, {
                where: { id: upd.id },
                transaction,
            });
        }

        if (shouldManageTransaction) await transaction.commit();

        return { status: true, message: "Serial generated successfully", result: serialNumber };
    } catch (error) {
        if (shouldManageTransaction) {
            try { await transaction.rollback(); } catch (_) { /* ignore */ }
        }
        throw error;
    }
}

// ─── CRUD Operations ────────────────────────────────────────────────────────

/**
 * Create a new serial master with detail rows.
 */
async function createSerial({ code, is_active = true, details = [] }) {
    const models = getTenantModels();
    const { SerialMaster, SerialMasterDetail, sequelize } = models;
    const transaction = await sequelize.transaction();

    try {
        // Check unique code
        const existing = await SerialMaster.findOne({ where: { code }, transaction });
        if (existing) {
            await transaction.rollback();
            throw new AppError(`Serial code "${code}" already exists`, 400);
        }

        const master = await SerialMaster.create({ code, is_active }, { transaction });

        // Create details with sort_order
        if (details.length > 0) {
            const detailRows = details.map((d, index) => ({
                serial_master_id: master.id,
                sort_order: d.sort_order != null ? d.sort_order : index,
                type: d.type,
                fixed_char: d.fixed_char || null,
                date_format: d.date_format || null,
                width: d.width || null,
                start_value: d.start_value || null,
                next_value: d.next_value != null ? d.next_value : (d.type === "SERIAL" ? 1 : null),
                reset_value: d.reset_value || null,
                last_generated: d.last_generated || null,
                reset_interval: d.reset_interval || null,
                last_reset_at: d.reset_interval ? new Date() : null,
            }));
            await SerialMasterDetail.bulkCreate(detailRows, { transaction });
        }

        await transaction.commit();

        // Re-fetch with details
        return await SerialMaster.findByPk(master.id, {
            include: [{ model: SerialMasterDetail, as: "details", order: [["sort_order", "ASC"]] }],
        });
    } catch (error) {
        try { await transaction.rollback(); } catch (_) { /* ignore */ }
        throw error;
    }
}

/**
 * Update an existing serial master and its details.
 */
async function updateSerial(id, { code, is_active, details }) {
    const models = getTenantModels();
    const { SerialMaster, SerialMasterDetail, sequelize } = models;
    const transaction = await sequelize.transaction();

    try {
        const master = await SerialMaster.findByPk(id, { transaction });
        if (!master) {
            await transaction.rollback();
            throw new AppError("Serial master not found", 404);
        }

        // Check unique code (if changing)
        if (code && code !== master.code) {
            const existing = await SerialMaster.findOne({ where: { code }, transaction });
            if (existing) {
                await transaction.rollback();
                throw new AppError(`Serial code "${code}" already exists`, 400);
            }
        }

        // Update master fields
        const updateFields = {};
        if (code !== undefined) updateFields.code = code;
        if (is_active !== undefined) updateFields.is_active = is_active;
        await master.update(updateFields, { transaction });

        // Replace details if provided
        if (details !== undefined) {
            await SerialMasterDetail.destroy({ where: { serial_master_id: id }, transaction });

            if (details.length > 0) {
                const detailRows = details.map((d, index) => ({
                    serial_master_id: id,
                    sort_order: d.sort_order != null ? d.sort_order : index,
                    type: d.type,
                    fixed_char: d.fixed_char || null,
                    date_format: d.date_format || null,
                    width: d.width || null,
                    start_value: d.start_value || null,
                    next_value: d.next_value != null ? d.next_value : (d.type === "SERIAL" ? 1 : null),
                    reset_value: d.reset_value || null,
                    last_generated: d.last_generated || null,
                    reset_interval: d.reset_interval || null,
                    last_reset_at: d.reset_interval ? new Date() : null,
                }));
                await SerialMasterDetail.bulkCreate(detailRows, { transaction });
            }
        }

        await transaction.commit();

        return await SerialMaster.findByPk(id, {
            include: [{ model: SerialMasterDetail, as: "details", order: [["sort_order", "ASC"]] }],
        });
    } catch (error) {
        try { await transaction.rollback(); } catch (_) { /* ignore */ }
        throw error;
    }
}

/**
 * List serial masters with pagination.
 */
async function getSerialList({ page = 1, limit = 20, q = null } = {}) {
    const models = getTenantModels();
    const { SerialMaster, SerialMasterDetail } = models;

    const where = {};
    if (q) {
        where.code = { [Op.iLike]: `%${q}%` };
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await SerialMaster.findAndCountAll({
        where,
        include: [{ model: SerialMasterDetail, as: "details", order: [["sort_order", "ASC"]] }],
        order: [["created_at", "DESC"]],
        limit,
        offset,
        distinct: true,
    });

    return {
        data: rows,
        meta: {
            total: count,
            page,
            limit,
            totalPages: Math.ceil(count / limit),
        },
    };
}

/**
 * Get a single serial master by ID.
 */
async function getSerialById(id) {
    const models = getTenantModels();
    const { SerialMaster, SerialMasterDetail } = models;

    const master = await SerialMaster.findByPk(id, {
        include: [{ model: SerialMasterDetail, as: "details", order: [["sort_order", "ASC"]] }],
    });

    if (!master) {
        throw new AppError("Serial master not found", 404);
    }

    return master;
}

/**
 * Deactivate a serial master (soft-delete = set is_active to false).
 */
async function deleteSerial(id) {
    const models = getTenantModels();
    const { SerialMaster } = models;

    const master = await SerialMaster.findByPk(id);
    if (!master) {
        throw new AppError("Serial master not found", 404);
    }

    await master.update({ is_active: false });
    return true;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    generateSerialByCode,
    createSerial,
    updateSerial,
    getSerialList,
    getSerialById,
    deleteSerial,
    // Expose helpers for testing
    formatDateSegment,
    getFinancialYear,
    incrementAlphaSequence,
    shouldResetByInterval,
};
