"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { Op } = require("sequelize");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");

const BillOfMaterial = db.BillOfMaterial;
const Product = db.Product;

const listBillOfMaterials = async ({
  page = 1,
  limit = 20,
  q = null,
  sortBy = "created_at",
  sortOrder = "DESC",
  code = null,
  code_op = null,
  name = null,
  name_op = null,
  description = null,
  description_op = null,
  visibility = null,
} = {}) => {
  const offset = (page - 1) * limit;

  const visibilityVal = visibility && ["active", "inactive", "all"].includes(visibility) ? visibility : "active";
  const where = {};
  if (visibilityVal === "active") {
    where.deleted_at = null;
  } else if (visibilityVal === "inactive") {
    where.deleted_at = { [Op.ne]: null };
  }
  const andConds = [];

  const buildStrCond = (field, val, op = "contains") => {
    const v = String(val || "").trim();
    if (!v) return null;
    const ops = { contains: Op.iLike, equals: Op.iLike, startsWith: Op.iLike, endsWith: Op.iLike };
    const pattern = op === "contains" ? `%${v}%` : op === "startsWith" ? `${v}%` : op === "endsWith" ? `%${v}` : v;
    return { [field]: { [ops[op] || Op.iLike]: pattern } };
  };
  if (code) {
    const c = buildStrCond("bom_code", code, code_op || "contains");
    if (c) andConds.push(c);
  }
  if (name) {
    const c = buildStrCond("bom_name", name, name_op || "contains");
    if (c) andConds.push(c);
  }
  if (description) {
    const c = buildStrCond("bom_description", description, description_op || "contains");
    if (c) andConds.push(c);
  }
  if (andConds.length) where[Op.and] = where[Op.and] ? [...(where[Op.and] || []), ...andConds] : andConds;

  // Map frontend sort field names to model column names
  const sortByMap = {
    code: "bom_code",
    name: "bom_name",
    description: "bom_description",
  };
  const orderSortBy = sortByMap[sortBy] || sortBy || "created_at";

  // Search functionality
  if (q) {
    const searchCond = {
      [Op.or]: [
        { bom_code: { [Op.iLike]: `%${q}%` } },
        { bom_name: { [Op.iLike]: `%${q}%` } },
        { bom_description: { [Op.iLike]: `%${q}%` } },
      ],
    };
    where[Op.and] = where[Op.and] ? [...(Array.isArray(where[Op.and]) ? where[Op.and] : [where[Op.and]]), searchCond] : [searchCond];
  }

  const findOptions = {
    where,
    order: [[orderSortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  };
  if (visibilityVal === "inactive" || visibilityVal === "all") {
    findOptions.paranoid = false;
  }

  const { count, rows } = await BillOfMaterial.findAndCountAll(findOptions);

  const data = rows.map((bom) => {
    const row = bom.toJSON();
    const bomDetail = Array.isArray(row.bom_detail) ? row.bom_detail : [];
    return {
      id: row.id,
      code: row.bom_code,
      name: row.bom_name,
      description: row.bom_description,
      number_of_products: bomDetail.length,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
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

const exportBillOfMaterials = async (params = {}) => {
  const { data } = await listBillOfMaterials({ ...params, page: 1, limit: 10000 });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Bill of Materials");
  worksheet.columns = [
    { header: "Code", key: "code", width: 18 },
    { header: "Name", key: "name", width: 24 },
    { header: "Description", key: "description", width: 30 },
    { header: "Products", key: "number_of_products", width: 12 },
    { header: "Created At", key: "created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
  (data || []).forEach((b) => {
    worksheet.addRow({
      code: b.code || "",
      name: b.name || "",
      description: b.description || "",
      number_of_products: b.number_of_products ?? "",
      created_at: b.created_at ? new Date(b.created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

const getBillOfMaterialById = async ({ id } = {}) => {
  if (!id) return null;

  const bom = await BillOfMaterial.findOne({
    where: { id, deleted_at: null },
  });

  if (!bom) return null;

  const row = bom.toJSON();
  return {
    id: row.id,
    bom_code: row.bom_code,
    bom_name: row.bom_name,
    bom_description: row.bom_description,
    bom_detail: row.bom_detail,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const createBillOfMaterial = async ({ payload, transaction } = {}) => {
  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    // Validate required fields
    if (!payload.bom_name || payload.bom_name.trim() === "") {
      throw new AppError("BOM name is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
    }

    // Validate at least one bom_detail is required
    const bomDetail = Array.isArray(payload.bom_detail) ? payload.bom_detail : [];
    if (bomDetail.length === 0) {
      throw new AppError("At least one BOM detail is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
    }

      // Validate bom_detail structure
      for (const detail of bomDetail) {
        if (!detail.product_id || !detail.quantity) {
          throw new AppError("Each BOM detail must have product_id and quantity", RESPONSE_STATUS_CODES.BAD_REQUEST);
        }
        if (typeof detail.product_id !== "number" || typeof detail.quantity !== "number") {
          throw new AppError("product_id and quantity must be numbers", RESPONSE_STATUS_CODES.BAD_REQUEST);
        }
        if (detail.quantity <= 0) {
          throw new AppError("Quantity must be greater than 0", RESPONSE_STATUS_CODES.BAD_REQUEST);
        }
        
        // Validate that product exists and is not deleted
        const product = await Product.findOne({
          where: { id: detail.product_id, deleted_at: null },
          transaction: t,
        });
        if (!product) {
          throw new AppError(`Product with ID ${detail.product_id} not found or has been deleted`, RESPONSE_STATUS_CODES.BAD_REQUEST);
        }
      }

    const bomData = {
      bom_code: payload.bom_code || null,
      bom_name: payload.bom_name.trim(),
      bom_description: payload.bom_description || null,
      bom_detail: bomDetail,
    };

    const created = await BillOfMaterial.create(bomData, { transaction: t });

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

const updateBillOfMaterial = async ({ id, payload, transaction } = {}) => {
  if (!id) return null;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const bom = await BillOfMaterial.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!bom) throw new AppError("Bill of Material not found", RESPONSE_STATUS_CODES.NOT_FOUND);

    // Validate required fields if provided
    if (payload.bom_name !== undefined) {
      if (!payload.bom_name || payload.bom_name.trim() === "") {
        throw new AppError("BOM name is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
      }
    }

    // Validate bom_detail if provided
    if (payload.bom_detail !== undefined) {
      const bomDetail = Array.isArray(payload.bom_detail) ? payload.bom_detail : [];
      if (bomDetail.length === 0) {
        throw new AppError("At least one BOM detail is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
      }

      // Validate bom_detail structure
      for (const detail of bomDetail) {
        if (!detail.product_id || !detail.quantity) {
          throw new AppError("Each BOM detail must have product_id and quantity", RESPONSE_STATUS_CODES.BAD_REQUEST);
        }
        if (typeof detail.product_id !== "number" || typeof detail.quantity !== "number") {
          throw new AppError("product_id and quantity must be numbers", RESPONSE_STATUS_CODES.BAD_REQUEST);
        }
        if (detail.quantity <= 0) {
          throw new AppError("Quantity must be greater than 0", RESPONSE_STATUS_CODES.BAD_REQUEST);
        }
        
        // Validate that product exists and is not deleted
        const product = await Product.findOne({
          where: { id: detail.product_id, deleted_at: null },
          transaction: t,
        });
        if (!product) {
          throw new AppError(`Product with ID ${detail.product_id} not found or has been deleted`, RESPONSE_STATUS_CODES.BAD_REQUEST);
        }
      }
    }

    const updateData = {};
    if (payload.bom_code !== undefined) updateData.bom_code = payload.bom_code;
    if (payload.bom_name !== undefined) updateData.bom_name = payload.bom_name.trim();
    if (payload.bom_description !== undefined) updateData.bom_description = payload.bom_description;
    if (payload.bom_detail !== undefined) updateData.bom_detail = payload.bom_detail;

    await bom.update(updateData, { transaction: t });

    if (committedHere) {
      await t.commit();
    }

    return bom.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const deleteBillOfMaterial = async ({ id, transaction } = {}) => {
  if (!id) return false;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const bom = await BillOfMaterial.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!bom) throw new AppError("Bill of Material not found", RESPONSE_STATUS_CODES.NOT_FOUND);

    // Use destroy() for soft delete when paranoid: true is enabled
    await bom.destroy({ transaction: t });

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

module.exports = {
  listBillOfMaterials,
  exportBillOfMaterials,
  getBillOfMaterialById,
  createBillOfMaterial,
  updateBillOfMaterial,
  deleteBillOfMaterial,
};

