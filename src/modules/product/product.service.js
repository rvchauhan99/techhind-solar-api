"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { Op } = require("sequelize");

const { Product, ProductType, ProductMake, MeasurementUnit } = db;

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

const listProducts = async ({
  page = 1,
  limit = 20,
  q = null,
  sortBy = "created_at",
  sortOrder = "DESC",
  product_name: productName = null,
  product_name_op: productNameOp = null,
  product_type_name: productTypeName = null,
  product_make_name: productMakeName = null,
  hsn_ssn_code: hsnSsnCode = null,
  measurement_unit_name: measurementUnitName = null,
  capacity,
  capacity_op,
  capacity_to,
  purchase_price,
  purchase_price_op,
  purchase_price_to,
  selling_price,
  selling_price_op,
  selling_price_to,
  mrp,
  mrp_op,
  mrp_to,
  gst_percent,
  gst_percent_op,
  gst_percent_to,
  min_stock_quantity,
  min_stock_quantity_op,
  min_stock_quantity_to,
  is_active: isActive = null,
} = {}) => {
  const offset = (page - 1) * limit;

  const where = {
    deleted_at: null,
  };

  if (hsnSsnCode) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({ hsn_ssn_code: { [Op.iLike]: `%${hsnSsnCode}%` } });
  }

  const addNumberCondition = (field, val, valTo, opStr) => {
    const v = parseFloat(val);
    const vTo = parseFloat(valTo);
    if (Number.isNaN(v) && Number.isNaN(vTo)) return;
    const cond = {};
    const op = (opStr || "").toLowerCase();
    if (op === "between" && !Number.isNaN(v) && !Number.isNaN(vTo)) cond[Op.between] = [v, vTo];
    else if (op === "gt" && !Number.isNaN(v)) cond[Op.gt] = v;
    else if (op === "lt" && !Number.isNaN(v)) cond[Op.lt] = v;
    else if (op === "gte" && !Number.isNaN(v)) cond[Op.gte] = v;
    else if (op === "lte" && !Number.isNaN(v)) cond[Op.lte] = v;
    else if (!Number.isNaN(v)) cond[Op.eq] = v;
    if (Reflect.ownKeys(cond).length > 0) {
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({ [field]: cond });
    }
  };
  addNumberCondition("capacity", capacity, capacity_to, capacity_op);
  addNumberCondition("purchase_price", purchase_price, purchase_price_to, purchase_price_op);
  addNumberCondition("selling_price", selling_price, selling_price_to, selling_price_op);
  addNumberCondition("mrp", mrp, mrp_to, mrp_op);
  addNumberCondition("gst_percent", gst_percent, gst_percent_to, gst_percent_op);
  addNumberCondition("min_stock_quantity", min_stock_quantity, min_stock_quantity_to, min_stock_quantity_op);

  if (q) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
      [Op.or]: [
        { product_name: { [Op.iLike]: `%${q}%` } },
        { product_description: { [Op.iLike]: `%${q}%` } },
        { hsn_ssn_code: { [Op.iLike]: `%${q}%` } },
      ],
    });
  }

  if (productName) {
    where[Op.and] = where[Op.and] || [];
    const cond = buildStringCondition("product_name", productName, productNameOp || "contains");
    if (cond) where[Op.and].push(cond);
  }

  if (isActive !== null && isActive !== "" && isActive !== undefined) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({ is_active: isActive === true || isActive === "true" || isActive === "1" });
  }

  const productTypeInclude = {
    model: ProductType,
    as: "productType",
    attributes: ["id", "name"],
    required: !!productTypeName,
    ...(productTypeName && { where: { name: { [Op.iLike]: `%${productTypeName}%` } } }),
  };
  const productMakeInclude = {
    model: ProductMake,
    as: "productMake",
    attributes: ["id", "name"],
    required: !!productMakeName,
    ...(productMakeName && { where: { name: { [Op.iLike]: `%${productMakeName}%` } } }),
  };
  const measurementUnitInclude = {
    model: MeasurementUnit,
    as: "measurementUnit",
    attributes: ["id", "unit"],
    required: !!measurementUnitName,
    ...(measurementUnitName && { where: { unit: { [Op.iLike]: `%${measurementUnitName}%` } } }),
  };

  const includeOpts = [productTypeInclude, productMakeInclude, measurementUnitInclude];

  const { count, rows } = await Product.findAndCountAll({
    where,
    include: includeOpts,
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  const data = rows.map((product) => {
    const row = product.toJSON();
    return {
      id: row.id,
      product_type_id: row.product_type_id,
      product_type_name: row.productType?.name || null,
      tracking_type: row.tracking_type ? row.tracking_type.toUpperCase() : "LOT",
      serial_required: row.serial_required,
      product_make_id: row.product_make_id,
      product_make_name: row.productMake?.name || null,
      product_name: row.product_name,
      product_description: row.product_description,
      hsn_ssn_code: row.hsn_ssn_code,
      measurement_unit_id: row.measurement_unit_id,
      measurement_unit_name: row.measurementUnit?.unit || null,
      capacity: row.capacity,
      is_active: row.is_active,
      purchase_price: row.purchase_price,
      selling_price: row.selling_price,
      mrp: row.mrp,
      gst_percent: row.gst_percent,
      min_stock_quantity: row.min_stock_quantity,
      properties: row.properties,
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

const getProductById = async ({ id } = {}) => {
  if (!id) return null;

  const product = await Product.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: ProductType, as: "productType", attributes: ["id", "name"] },
      { model: ProductMake, as: "productMake", attributes: ["id", "name"] },
      { model: MeasurementUnit, as: "measurementUnit", attributes: ["id", "unit"] },
    ],
  });

  if (!product) return null;

  const row = product.toJSON();
  return {
    id: row.id,
    product_type_id: row.product_type_id,
    product_type_name: row.productType?.name || null,
    tracking_type: row.tracking_type ? row.tracking_type.toUpperCase() : "LOT",
    serial_required: row.serial_required,
    product_make_id: row.product_make_id,
    product_make_name: row.productMake?.name || null,
    product_name: row.product_name,
    product_description: row.product_description,
    hsn_ssn_code: row.hsn_ssn_code,
    measurement_unit_id: row.measurement_unit_id,
      measurement_unit_name: row.measurementUnit?.unit || null,
      capacity: row.capacity,
      is_active: row.is_active,
      purchase_price: row.purchase_price,
    selling_price: row.selling_price,
    mrp: row.mrp,
    gst_percent: row.gst_percent,
    min_stock_quantity: row.min_stock_quantity,
    properties: row.properties,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const createProduct = async ({ payload, transaction } = {}) => {
  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    // Normalize tracking_type to uppercase and validate
    const trackingType = payload.tracking_type ? payload.tracking_type.toUpperCase() : "LOT";
    if (trackingType !== "LOT" && trackingType !== "SERIAL") {
      throw new Error("Tracking type must be either LOT or SERIAL");
    }

    // Auto-set serial_required based on tracking_type
    const serialRequired = trackingType === "SERIAL";

    const productData = {
      product_type_id: payload.product_type_id,
      product_make_id: payload.product_make_id,
      product_name: payload.product_name,
      product_description: payload.product_description || null,
      hsn_ssn_code: payload.hsn_ssn_code || null,
      measurement_unit_id: payload.measurement_unit_id,
      capacity: payload.capacity || null,
      is_active: payload.is_active !== undefined ? payload.is_active : true,
      purchase_price: payload.purchase_price,
      selling_price: payload.selling_price,
      mrp: payload.mrp,
      gst_percent: payload.gst_percent,
      min_stock_quantity: payload.min_stock_quantity || 0,
      tracking_type: trackingType,
      serial_required: serialRequired,
      properties: payload.properties || null,
    };

    const created = await Product.create(productData, { transaction: t });

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

const updateProduct = async ({ id, payload, transaction } = {}) => {
  if (!id) return null;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const product = await Product.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!product) throw new Error("Product not found");

    // Normalize tracking_type to uppercase and validate if provided
    let trackingType = product.tracking_type;
    let serialRequired = product.serial_required;

    if (payload.tracking_type !== undefined) {
      trackingType = payload.tracking_type.toUpperCase();
      if (trackingType !== "LOT" && trackingType !== "SERIAL") {
        throw new Error("Tracking type must be either LOT or SERIAL");
      }
      // Auto-set serial_required based on tracking_type
      serialRequired = trackingType === "SERIAL";
    } else if (payload.serial_required !== undefined) {
      // If only serial_required is provided, ensure it matches current tracking_type
      const currentTrackingType = product.tracking_type.toUpperCase();
      if (currentTrackingType === "SERIAL" && !payload.serial_required) {
        throw new Error("serial_required cannot be false when tracking_type is SERIAL");
      }
      if (currentTrackingType === "LOT" && payload.serial_required) {
        throw new Error("serial_required cannot be true when tracking_type is LOT");
      }
      serialRequired = payload.serial_required;
    }

    await product.update(
      {
        product_type_id: payload.product_type_id ?? product.product_type_id,
        tracking_type: trackingType,
        serial_required: serialRequired,
        product_make_id: payload.product_make_id ?? product.product_make_id,
        product_name: payload.product_name ?? product.product_name,
        product_description: payload.product_description !== undefined ? payload.product_description : product.product_description,
        hsn_ssn_code: payload.hsn_ssn_code !== undefined ? payload.hsn_ssn_code : product.hsn_ssn_code,
        measurement_unit_id: payload.measurement_unit_id ?? product.measurement_unit_id,
        capacity: payload.capacity !== undefined ? payload.capacity : product.capacity,
        is_active: payload.is_active !== undefined ? payload.is_active : product.is_active,
        purchase_price: payload.purchase_price ?? product.purchase_price,
        selling_price: payload.selling_price ?? product.selling_price,
        mrp: payload.mrp ?? product.mrp,
        gst_percent: payload.gst_percent ?? product.gst_percent,
        min_stock_quantity: payload.min_stock_quantity !== undefined ? payload.min_stock_quantity : product.min_stock_quantity,
        properties: payload.properties !== undefined ? payload.properties : product.properties,
      },
      { transaction: t }
    );

    if (committedHere) {
      await t.commit();
    }

    return product.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const deleteProduct = async ({ id, transaction } = {}) => {
  if (!id) return false;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const product = await Product.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!product) throw new Error("Product not found");

    // Use destroy() for soft delete when paranoid: true is enabled
    await product.destroy({ transaction: t });

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

const exportProducts = async (params = {}) => {
  const result = await listProducts({ ...params, page: 1, limit: 10000 });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Products");
  worksheet.columns = [
    { header: "Product Type", key: "product_type_name", width: 18 },
    { header: "Product Make", key: "product_make_name", width: 18 },
    { header: "Product Name", key: "product_name", width: 28 },
    { header: "Description", key: "product_description", width: 30 },
    { header: "HSN/SSN Code", key: "hsn_ssn_code", width: 14 },
    { header: "Unit", key: "measurement_unit_name", width: 10 },
    { header: "Capacity", key: "capacity", width: 10 },
    { header: "Purchase Price", key: "purchase_price", width: 14 },
    { header: "Selling Price", key: "selling_price", width: 14 },
    { header: "MRP", key: "mrp", width: 12 },
    { header: "GST %", key: "gst_percent", width: 8 },
    { header: "Min Stock", key: "min_stock_quantity", width: 10 },
    { header: "Tracking Type", key: "tracking_type", width: 12 },
    { header: "Active", key: "is_active", width: 8 },
    { header: "Created At", key: "created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };
  (result.data || []).forEach((p) => {
    worksheet.addRow({
      product_type_name: p.product_type_name || "",
      product_make_name: p.product_make_name || "",
      product_name: p.product_name || "",
      product_description: p.product_description || "",
      hsn_ssn_code: p.hsn_ssn_code || "",
      measurement_unit_name: p.measurement_unit_name || "",
      capacity: p.capacity != null ? p.capacity : "",
      purchase_price: p.purchase_price != null ? p.purchase_price : "",
      selling_price: p.selling_price != null ? p.selling_price : "",
      mrp: p.mrp != null ? p.mrp : "",
      gst_percent: p.gst_percent != null ? p.gst_percent : "",
      min_stock_quantity: p.min_stock_quantity != null ? p.min_stock_quantity : "",
      tracking_type: p.tracking_type || "",
      is_active: p.is_active ? "Yes" : "No",
      created_at: p.created_at ? new Date(p.created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

module.exports = {
  listProducts,
  exportProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};

