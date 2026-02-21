"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { Op } = require("sequelize");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

/** Indian GSTIN: 15 chars. Chars 1-2 = state code, 3-12 = PAN (10 chars), 13 = entity, 14 = Z, 15 = checksum. */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/**
 * Validates Indian GSTIN and derives PAN from it (chars 3-12).
 * @param {string} gstin - Raw GSTIN (trimmed and uppercased internally).
 * @returns {{ normalizedGstin: string, pan: string }}
 * @throws {AppError} 400 if GSTIN is invalid.
 */
const derivePanFromGstin = (gstin) => {
  const raw = typeof gstin === "string" ? gstin.trim() : "";
  if (!raw) {
    throw new AppError("GSTIN is required when deriving PAN", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  const normalized = raw.toUpperCase().replace(/\s/g, "");
  if (normalized.length !== 15) {
    throw new AppError("Invalid GSTIN format: must be 15 characters", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }
  if (!GSTIN_REGEX.test(normalized)) {
    throw new AppError(
      "Invalid GSTIN format: expected Indian format (2 digits state + 10 char PAN + entity + Z + checksum)",
      RESPONSE_STATUS_CODES.BAD_REQUEST
    );
  }
  const pan = normalized.slice(2, 12);
  return { normalizedGstin: normalized, pan };
};

const VALID_STRING_OPS = ["contains", "notContains", "equals", "notEquals", "startsWith", "endsWith"];

/** Generate next supplier code: SUP-00001, SUP-00002, ... (prefix + 5-digit global sequence). */
const generateSupplierCode = async () => {
  const models = getTenantModels();
  const { Supplier } = models;
  const rows = await Supplier.findAll({
    where: { supplier_code: { [Op.like]: "SUP-%" } },
    attributes: ["supplier_code"],
    raw: true,
  });
  const prefix = "SUP-";
  const digitRegex = /^SUP-(\d+)$/;
  let maxNum = 0;
  rows.forEach((r) => {
    const code = r.supplier_code || "";
    const m = code.match(digitRegex);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  const nextNum = maxNum + 1;
  const padded = String(nextNum).padStart(5, "0");
  return `${prefix}${padded}`;
};

/** Return next supplier code for API/form prefill. */
const getNextSupplierCode = async () => {
  return await generateSupplierCode();
};

const buildStringCondition = (field, value, op = "contains") => {
  const val = String(value || "").trim();
  if (!val) return null;
  const safeOp = VALID_STRING_OPS.includes(op) ? op : "contains";
  switch (safeOp) {
    case "contains":
      return { [field]: { [Op.iLike]: `%${val}%` } };
    case "notContains":
      return { [field]: { [Op.notILike]: `%${val}%` } };
    case "equals":
      return { [field]: { [Op.iLike]: val } };
    case "notEquals":
      return { [field]: { [Op.notILike]: val } };
    case "startsWith":
      return { [field]: { [Op.iLike]: `${val}%` } };
    case "endsWith":
      return { [field]: { [Op.iLike]: `%${val}` } };
    default:
      return { [field]: { [Op.iLike]: `%${val}%` } };
  }
};

const listSuppliers = async ({
  page = 1,
  limit = 20,
  q = null,
  sortBy = "id",
  sortOrder = "DESC",
  supplier_code: supplierCode = null,
  supplier_code_op: supplierCodeOp = null,
  supplier_name: supplierName = null,
  supplier_name_op: supplierNameOp = null,
  contact_person,
  phone,
  email,
  state_name,
  gstin,
  is_active,
  visibility = null,
} = {}) => {
  const models = getTenantModels();
  const { Supplier, State } = models;
  const offset = (page - 1) * limit;

  const visibilityVal = visibility && ["active", "inactive", "all"].includes(visibility) ? visibility : "active";
  const where = {};
  if (visibilityVal === "active") {
    where.deleted_at = null;
  } else if (visibilityVal === "inactive") {
    where.deleted_at = { [Op.ne]: null };
  }

  if (contact_person) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({ contact_person: { [Op.iLike]: `%${contact_person}%` } });
  }
  if (phone) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({ phone: { [Op.iLike]: `%${phone}%` } });
  }
  if (email) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({ email: { [Op.iLike]: `%${email}%` } });
  }
  if (gstin) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({ gstin: { [Op.iLike]: `%${gstin}%` } });
  }
  if (is_active !== undefined && is_active !== "" && is_active !== null) {
    where.is_active = is_active === "true" || is_active === true;
  }

  const stateInclude = {
    model: State,
    as: "state",
    attributes: ["id", "name"],
    required: !!state_name,
    ...(state_name && { where: { name: { [Op.iLike]: `%${state_name}%` } } }),
  };

  if (q) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
      [Op.or]: [
        { supplier_code: { [Op.iLike]: `%${q}%` } },
        { supplier_name: { [Op.iLike]: `%${q}%` } },
        { contact_person: { [Op.iLike]: `%${q}%` } },
        { phone: { [Op.iLike]: `%${q}%` } },
        { email: { [Op.iLike]: `%${q}%` } },
        { gstin: { [Op.iLike]: `%${q}%` } },
      ],
    });
  }

  if (supplierCode) {
    where[Op.and] = where[Op.and] || [];
    const cond = buildStringCondition("supplier_code", supplierCode, supplierCodeOp || "contains");
    if (cond) where[Op.and].push(cond);
  }

  if (supplierName) {
    where[Op.and] = where[Op.and] || [];
    const cond = buildStringCondition("supplier_name", supplierName, supplierNameOp || "contains");
    if (cond) where[Op.and].push(cond);
  }

  const findOptions = {
    where,
    include: [stateInclude],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  };
  if (visibilityVal === "inactive" || visibilityVal === "all") {
    findOptions.paranoid = false;
  }

  const { count, rows } = await Supplier.findAndCountAll(findOptions);

  const data = rows.map((supplier) => {
    const row = supplier.toJSON();
    return {
      id: row.id,
      supplier_code: row.supplier_code,
      supplier_name: row.supplier_name,
      contact_person: row.contact_person,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      state_id: row.state_id,
      state_name: row.state?.name || null,
      pincode: row.pincode,
      gstin: row.gstin,
      pan_number: row.pan_number,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return {
    data,
    meta: {
      page,
      limit,
      total: count,
      pages: limit > 0 ? Math.ceil(count / limit) : 0,
    },
  };
};

const getSupplierById = async ({ id } = {}) => {
  if (!id) return null;
  const models = getTenantModels();
  const { Supplier, State } = models;
  const supplier = await Supplier.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: State, as: "state", attributes: ["id", "name"] },
    ],
  });

  if (!supplier) return null;

  const row = supplier.toJSON();
  return {
    id: row.id,
    supplier_code: row.supplier_code,
    supplier_name: row.supplier_name,
    contact_person: row.contact_person,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    state_id: row.state_id,
    state_name: row.state?.name || null,
    pincode: row.pincode,
    gstin: row.gstin,
    pan_number: row.pan_number,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const createSupplier = async ({ payload, transaction } = {}, retryOnConflict = false) => {
  const models = getTenantModels();
  const { Supplier } = models;
  const t = transaction || (await models.sequelize.transaction());
  let committedHere = !transaction;

  try {
    let gstin = payload.gstin != null ? String(payload.gstin).trim() : "";
    let pan_number = null;
    if (gstin) {
      const derived = derivePanFromGstin(gstin);
      gstin = derived.normalizedGstin;
      pan_number = derived.pan;
    } else {
      gstin = null;
    }

    let supplierCode =
      payload.supplier_code != null && String(payload.supplier_code).trim() !== ""
        ? String(payload.supplier_code).trim()
        : null;
    if (supplierCode == null) {
      supplierCode = await generateSupplierCode();
    }

    const supplierData = {
      supplier_code: supplierCode,
      supplier_name: payload.supplier_name,
      contact_person: payload.contact_person || null,
      phone: payload.phone || null,
      email: payload.email || null,
      address: payload.address || null,
      city: payload.city || null,
      state_id: payload.state_id || null,
      pincode: payload.pincode || null,
      gstin,
      pan_number,
      is_active: payload.is_active !== undefined ? payload.is_active : true,
    };

    const created = await Supplier.create(supplierData, { transaction: t });

    if (committedHere) {
      await t.commit();
    }

    return created.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    const isUniqueError =
      err.name === "SequelizeUniqueConstraintError" ||
      (err.parent && err.parent.code === "23505");
    if (isUniqueError && !retryOnConflict && (!payload.supplier_code || String(payload.supplier_code).trim() === "")) {
      return createSupplier({ payload: { ...payload, supplier_code: await generateSupplierCode() }, transaction }, true);
    }
    throw err;
  }
};

const updateSupplier = async ({ id, payload, transaction } = {}) => {
  if (!id) return null;
  const models = getTenantModels();
  const { Supplier } = models;
  const t = transaction || (await models.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const supplier = await Supplier.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!supplier) throw new Error("Supplier not found");

    let gstin = supplier.gstin;
    let pan_number = supplier.pan_number;
    if ("gstin" in payload) {
      const raw = payload.gstin != null ? String(payload.gstin).trim() : "";
      if (raw) {
        const derived = derivePanFromGstin(payload.gstin);
        gstin = derived.normalizedGstin;
        pan_number = derived.pan;
      } else {
        gstin = null;
        pan_number = null;
      }
    }

    await supplier.update(
      {
        supplier_code: payload.supplier_code ?? supplier.supplier_code,
        supplier_name: payload.supplier_name ?? supplier.supplier_name,
        contact_person: payload.contact_person !== undefined ? payload.contact_person : supplier.contact_person,
        phone: payload.phone !== undefined ? payload.phone : supplier.phone,
        email: payload.email !== undefined ? payload.email : supplier.email,
        address: payload.address !== undefined ? payload.address : supplier.address,
        city: payload.city !== undefined ? payload.city : supplier.city,
        state_id: payload.state_id !== undefined ? payload.state_id : supplier.state_id,
        pincode: payload.pincode !== undefined ? payload.pincode : supplier.pincode,
        gstin,
        pan_number,
        is_active: payload.is_active !== undefined ? payload.is_active : supplier.is_active,
      },
      { transaction: t }
    );

    if (committedHere) {
      await t.commit();
    }

    return supplier.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const deleteSupplier = async ({ id, transaction } = {}) => {
  if (!id) return false;
  const models = getTenantModels();
  const { Supplier } = models;
  const t = transaction || (await models.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const supplier = await Supplier.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!supplier) throw new Error("Supplier not found");

    await supplier.destroy({ transaction: t });

    if (committedHere) {
      await t.commit();
    }

    return true;
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const exportSuppliers = async ({
  q = null,
  sortBy = "id",
  sortOrder = "DESC",
  supplier_code: supplierCode = null,
  supplier_code_op: supplierCodeOp = null,
  supplier_name: supplierName = null,
  supplier_name_op: supplierNameOp = null,
  contact_person,
  phone,
  email,
  state_name,
  gstin,
  is_active,
} = {}) => {
  const result = await listSuppliers({
    page: 1,
    limit: 10000,
    q,
    sortBy,
    sortOrder,
    supplier_code: supplierCode,
    supplier_code_op: supplierCodeOp,
    supplier_name: supplierName,
    supplier_name_op: supplierNameOp,
    contact_person,
    phone,
    email,
    state_name,
    gstin,
    is_active,
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Suppliers");
  worksheet.columns = [
    { header: "Supplier Code", key: "supplier_code", width: 18 },
    { header: "Supplier Name", key: "supplier_name", width: 28 },
    { header: "Contact Person", key: "contact_person", width: 20 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Email", key: "email", width: 24 },
    { header: "Address", key: "address", width: 30 },
    { header: "City", key: "city", width: 16 },
    { header: "State", key: "state_name", width: 18 },
    { header: "Pincode", key: "pincode", width: 10 },
    { header: "GSTIN", key: "gstin", width: 18 },
    { header: "Active", key: "is_active", width: 8 },
    { header: "Created At", key: "created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };
  (result.data || []).forEach((s) => {
    worksheet.addRow({
      supplier_code: s.supplier_code || "",
      supplier_name: s.supplier_name || "",
      contact_person: s.contact_person || "",
      phone: s.phone || "",
      email: s.email || "",
      address: s.address || "",
      city: s.city || "",
      state_name: s.state_name || "",
      pincode: s.pincode || "",
      gstin: s.gstin || "",
      is_active: s.is_active ? "Yes" : "No",
      created_at: s.created_at ? new Date(s.created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

module.exports = {
  listSuppliers,
  exportSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getNextSupplierCode,
  derivePanFromGstin,
};

