"use strict";

const db = require("../../models/index.js");
const { Op } = require("sequelize");
const { buildStringCond, buildDateCond } = require("../../common/utils/columnFilterBuilders.js");
const { B2BClient, B2BClientShipTo } = db;

const listClients = async ({
  page = 1,
  limit = 20,
  q,
  filters = {},
  sortBy = "id",
  sortOrder = "DESC",
} = {}) => {
  const offset = (page - 1) * limit;
  const where = { deleted_at: null };

  if (q) {
    where[Op.or] = [
      { client_code: { [Op.iLike]: `%${q}%` } },
      { client_name: { [Op.iLike]: `%${q}%` } },
      { contact_person: { [Op.iLike]: `%${q}%` } },
      { email: { [Op.iLike]: `%${q}%` } },
      { gstin: { [Op.iLike]: `%${q}%` } },
    ];
  }

  const andConds = [];
  const clientCodeCond = buildStringCond("client_code", filters.client_code, filters.client_code_op || "contains");
  if (clientCodeCond) andConds.push(clientCodeCond);
  const clientNameCond = buildStringCond("client_name", filters.client_name, filters.client_name_op || "contains");
  if (clientNameCond) andConds.push(clientNameCond);
  const contactPersonCond = buildStringCond(
    "contact_person",
    filters.contact_person,
    filters.contact_person_op || "contains"
  );
  if (contactPersonCond) andConds.push(contactPersonCond);
  const phoneCond = buildStringCond("phone", filters.phone, filters.phone_op || "contains");
  if (phoneCond) andConds.push(phoneCond);
  const emailCond = buildStringCond("email", filters.email, filters.email_op || "contains");
  if (emailCond) andConds.push(emailCond);
  const gstinCond = buildStringCond("gstin", filters.gstin, filters.gstin_op || "contains");
  if (gstinCond) andConds.push(gstinCond);
  const billingCityCond = buildStringCond(
    "billing_city",
    filters.billing_city,
    filters.billing_city_op || "contains"
  );
  if (billingCityCond) andConds.push(billingCityCond);
  const billingStateCond = buildStringCond(
    "billing_state",
    filters.billing_state,
    filters.billing_state_op || "contains"
  );
  if (billingStateCond) andConds.push(billingStateCond);
  const createdAtCond = buildDateCond(
    "created_at",
    filters.created_at,
    filters.created_at_op || "inRange",
    filters.created_at_to
  );
  if (createdAtCond) andConds.push(createdAtCond);
  if (filters.is_active !== undefined && filters.is_active !== "" && filters.is_active != null) {
    andConds.push({ is_active: filters.is_active === "true" || filters.is_active === true });
  }
  if (andConds.length > 0) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(...andConds);
  }

  const { count, rows } = await B2BClient.findAndCountAll({
    where,
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  return {
    data: rows,
    meta: { total: count, page, limit, pages: limit > 0 ? Math.ceil(count / limit) : 0 },
  };
};

const getClientById = async ({ id }) => {
  return B2BClient.findOne({
    where: { id, deleted_at: null },
    include: [{ model: B2BClientShipTo, as: "shipToAddresses", where: { deleted_at: null, is_active: true }, required: false }],
  });
};

const createClient = async ({ payload, transaction }) => {
  const client = await B2BClient.create(payload, { transaction });
  const hasBilling =
    (payload.billing_address && String(payload.billing_address).trim()) ||
    (payload.billing_city && String(payload.billing_city).trim()) ||
    (payload.billing_state && String(payload.billing_state).trim()) ||
    (payload.billing_pincode && String(payload.billing_pincode).trim());
  if (hasBilling) {
    await B2BClientShipTo.create(
      {
        client_id: client.id,
        ship_to_name: "Billing Address",
        address: payload.billing_address && String(payload.billing_address).trim() ? payload.billing_address : " ",
        city: payload.billing_city || null,
        district: payload.billing_district || null,
        state: payload.billing_state || null,
        pincode: payload.billing_pincode || null,
        landmark: payload.billing_landmark || null,
        country: payload.billing_country || "India",
        is_default: true,
        is_active: true,
      },
      { transaction }
    );
  }
  return client;
};

const updateClient = async ({ id, payload, transaction }) => {
  const client = await B2BClient.findByPk(id);
  if (!client) return null;
  await client.update(payload, { transaction });
  return client;
};

/** Generate next client code: CLI-00001, CLI-00002, ... (prefix + 5-digit global sequence). */
const generateClientCode = async () => {
  const rows = await B2BClient.findAll({
    where: { client_code: { [Op.like]: "CLI-%" } },
    attributes: ["client_code"],
    raw: true,
  });
  const prefix = "CLI-";
  const digitRegex = /^CLI-(\d+)$/;
  let maxNum = 0;
  rows.forEach((r) => {
    const code = r.client_code || "";
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

const getNextClientCode = async () => {
  return await generateClientCode();
};

const deleteClient = async ({ id, transaction }) => {
  const client = await B2BClient.findByPk(id);
  if (!client) return null;
  await client.update({ is_active: false }, { transaction });
  return { message: "Client deactivated successfully" };
};

const listShipTos = async ({ client_id, page = 1, limit = 100 }) => {
  const offset = (page - 1) * limit;
  const where = { deleted_at: null, is_active: true };
  if (client_id) where.client_id = client_id;

  const { count, rows } = await B2BClientShipTo.findAndCountAll({
    where,
    order: [["id", "DESC"]],
    limit,
    offset,
  });

  return {
    data: rows,
    meta: { total: count, page, limit, pages: limit > 0 ? Math.ceil(count / limit) : 0 },
  };
};

const createShipTo = async ({ client_id, payload, transaction }) => {
  if (payload.is_default === true) {
    await B2BClientShipTo.update(
      { is_default: false },
      { where: { client_id }, transaction }
    );
  }
  return B2BClientShipTo.create({ ...payload, client_id }, { transaction });
};

const updateShipTo = async ({ id, payload, transaction }) => {
  const shipTo = await B2BClientShipTo.findByPk(id);
  if (!shipTo) return null;
  if (payload.is_default === true && shipTo.client_id) {
    await B2BClientShipTo.update(
      { is_default: false },
      { where: { client_id: shipTo.client_id }, transaction }
    );
  }
  await shipTo.update(payload, { transaction });
  return shipTo;
};

const deleteShipTo = async ({ id, transaction }) => {
  const shipTo = await B2BClientShipTo.findByPk(id);
  if (!shipTo) return null;
  await shipTo.update({ is_active: false }, { transaction });
  return { message: "Ship-to address deactivated successfully" };
};

module.exports = {
  listClients,
  getClientById,
  createClient,
  updateClient,
  getNextClientCode,
  deleteClient,
  listShipTos,
  createShipTo,
  updateShipTo,
  deleteShipTo,
};
