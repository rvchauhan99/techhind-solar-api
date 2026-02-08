"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { Op } = require("sequelize");

const { Supplier, State } = db;

const VALID_STRING_OPS = ["contains", "notContains", "equals", "notEquals", "startsWith", "endsWith"];

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
  sortBy = "created_at",
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
  const offset = (page - 1) * limit;

  const where = {
    deleted_at: null,
  };

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

  const { count, rows } = await Supplier.findAndCountAll({
    where,
    include: [stateInclude],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

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

const createSupplier = async ({ payload, transaction } = {}) => {
  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const supplierData = {
      supplier_code: payload.supplier_code,
      supplier_name: payload.supplier_name,
      contact_person: payload.contact_person || null,
      phone: payload.phone || null,
      email: payload.email || null,
      address: payload.address || null,
      city: payload.city || null,
      state_id: payload.state_id || null,
      pincode: payload.pincode || null,
      gstin: payload.gstin || null,
      pan_number: payload.pan_number || null,
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
    throw err;
  }
};

const updateSupplier = async ({ id, payload, transaction } = {}) => {
  if (!id) return null;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const supplier = await Supplier.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!supplier) throw new Error("Supplier not found");

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
        gstin: payload.gstin !== undefined ? payload.gstin : supplier.gstin,
        pan_number: payload.pan_number !== undefined ? payload.pan_number : supplier.pan_number,
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

  const t = transaction || (await db.sequelize.transaction());
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
  sortBy = "created_at",
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
};

