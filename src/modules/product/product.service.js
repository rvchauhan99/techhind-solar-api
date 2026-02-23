"use strict";

const ExcelJS = require("exceljs");
const { parse } = require("csv-parse/sync");
const db = require("../../models/index.js");
const { Op } = require("sequelize");
const { getTenantModels } = require("../tenant/tenantModels.js");

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
  sortBy = "id",
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
  visibility = null,
} = {}) => {
  const models = getTenantModels();
  const { Product, ProductType, ProductMake, MeasurementUnit } = models;
  const offset = (page - 1) * limit;

  const visibilityVal = visibility && ["active", "inactive", "all"].includes(visibility) ? visibility : "active";
  const where = {};
  // Filter by is_active for Active/Inactive (master data: no physical delete, only deactivate)
  if (visibilityVal === "active") {
    where.is_active = true;
    where.deleted_at = null;
  } else if (visibilityVal === "inactive") {
    where.is_active = false;
    where.deleted_at = null;
  } else {
    where.deleted_at = null;
  }

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

  const findOptions = {
    where,
    include: includeOpts,
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  };

  const { count, rows } = await Product.findAndCountAll(findOptions);

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
      min_purchase_price: row.min_purchase_price,
      avg_purchase_price: row.avg_purchase_price,
      max_purchase_price: row.max_purchase_price,
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
  const models = getTenantModels();
  const { Product, ProductType, ProductMake, MeasurementUnit } = models;
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
    min_purchase_price: row.min_purchase_price,
    avg_purchase_price: row.avg_purchase_price,
    max_purchase_price: row.max_purchase_price,
    properties: row.properties,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const createProduct = async ({ payload, transaction } = {}) => {
  const models = getTenantModels();
  const { Product } = models;
  const t = transaction || (await models.sequelize.transaction());
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
  const models = getTenantModels();
  const { Product } = models;
  if (!id) return null;

  const t = transaction || (await models.sequelize.transaction());
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
  const models = getTenantModels();
  const { Product } = models;
  if (!id) return false;

  const t = transaction || (await models.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const product = await Product.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!product) throw new Error("Product not found");

    // Soft delete: deactivate only (master data must not be removed due to references)
    await product.update({ is_active: false }, { transaction: t });

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
  const models = getTenantModels();
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

const PRODUCT_IMPORT_CSV_HEADERS = [
  "product_type_name",
  "product_make_name",
  "product_name",
  "measurement_unit_name",
  "capacity",
  "hsn_ssn_code",
  "tracking_type",
  "gst_percent",
  "min_stock_quantity",
  "is_active",
  "product_description",
  "panel_type",
  "panel_technology_name",
  "material",
  "warranty",
  "additional_type",
  "additional_warranty",
  "additional_performance_warranty",
  "ac_quantity",
  "dc_quantity",
  "purchase_price",
  "selling_price",
  "mrp",
];

function getSampleCsvBuffer() {
  const header = PRODUCT_IMPORT_CSV_HEADERS.join(",");
  const row1 = [
    "Panel",
    "ADANI",
    "ADANI DCR TOPCON 11 WP",
    "Nos",
    "11",
    "854140",
    "LOT",
    "18",
    "0",
    "true",
    "Sample panel product",
    "DCR",
    "TOPCON",
    "",
    "",
    "",
    "",
    "",
    "0",
    "0",
    "0",
    "0",
    "0",
  ].join(",");
  const row2 = [
    "Inverter",
    "LUMINOUS",
    "LUMINOUS 3KVA Inverter",
    "Nos",
    "3",
    "8504",
    "LOT",
    "18",
    "0",
    "true",
    "",
    "",
    "",
    "5 Years",
    "",
    "",
    "",
    "",
    "0",
    "0",
    "0",
    "0",
    "0",
  ].join(",");
  return Buffer.from([header, row1, row2].join("\r\n"), "utf8");
}

const trim = (s) => (typeof s === "string" ? s.trim() : s == null ? "" : String(s));
const parseNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const parseBool = (v) => {
  const s = String(v || "").toLowerCase().trim();
  return s === "true" || s === "1" || s === "yes";
};

async function importProductsFromCsv({ fileBuffer, req } = {}) {
  const models = getTenantModels(req);
  const { Product, ProductType, ProductMake, MeasurementUnit, PanelTechnology } = models;
  if (!Product || !ProductType || !ProductMake || !MeasurementUnit) {
    throw new Error("Product import requires tenant models");
  }

  let rows;
  try {
    rows = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    });
  } catch (err) {
    throw new Error(`Invalid CSV: ${err.message}`);
  }

  const [productTypes, productMakes, measurementUnits, panelTechnologies] = await Promise.all([
    ProductType.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }),
    ProductMake.findAll({ where: { deleted_at: null }, attributes: ["id", "name", "product_type_id"] }),
    MeasurementUnit.findAll({ where: { deleted_at: null }, attributes: ["id", "unit"] }),
    PanelTechnology ? PanelTechnology.findAll({ where: { deleted_at: null }, attributes: ["id", "name"] }) : Promise.resolve([]),
  ]);

  const byNameLower = (arr, key) => {
    const m = new Map();
    (arr || []).forEach((r) => {
      const n = (r[key] ?? r.name ?? r.unit ?? "").toString().toLowerCase().trim();
      if (n && !m.has(n)) m.set(n, r);
    });
    return m;
  };
  const productTypeByName = byNameLower(productTypes, "name");
  const measurementUnitByUnit = byNameLower(measurementUnits, "unit");
  const panelTechByName = PanelTechnology ? byNameLower(panelTechnologies, "name") : new Map();

  const getProductMakeId = (makeName, productTypeId) => {
    const nameLower = trim(makeName).toLowerCase();
    if (!nameLower || !productTypeId) return null;
    const make = (productMakes || []).find(
      (m) => m.name && m.name.toLowerCase().trim() === nameLower && Number(m.product_type_id) === Number(productTypeId)
    );
    return make ? make.id : null;
  };

  const created = [];
  const skipped = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const productName = trim(row.product_name ?? row["Product Name"] ?? "");
    if (!productName) {
      errors.push({ row: rowNum, product_name: "", message: "Product name is required" });
      continue;
    }

    const typeName = trim(row.product_type_name ?? row["Product Type"] ?? "");
    const makeName = trim(row.product_make_name ?? row["Product Make"] ?? "");
    const unitName = trim(row.measurement_unit_name ?? row["Measurement Unit"] ?? "");

    const productType = typeName ? productTypeByName.get(typeName.toLowerCase()) : null;
    const productTypeId = productType ? productType.id : null;
    if (!productTypeId) {
      errors.push({ row: rowNum, product_name: productName, message: `Product type not found: "${typeName}"` });
      continue;
    }

    const productMakeId = getProductMakeId(makeName, productTypeId);
    if (!productMakeId) {
      errors.push({ row: rowNum, product_name: productName, message: `Product make not found: "${makeName}" for type "${typeName}"` });
      continue;
    }

    const mu = unitName ? measurementUnitByUnit.get(unitName.toLowerCase()) : null;
    const measurementUnitId = mu ? mu.id : null;
    if (!measurementUnitId) {
      errors.push({ row: rowNum, product_name: productName, message: `Measurement unit not found: "${unitName}"` });
      continue;
    }

    const trackingTypeRaw = trim(row.tracking_type ?? row["Tracking Type"] ?? "LOT");
    const trackingType = trackingTypeRaw ? trackingTypeRaw.toUpperCase() : "LOT";
    if (trackingType !== "LOT" && trackingType !== "SERIAL") {
      errors.push({ row: rowNum, product_name: productName, message: "Tracking type must be LOT or SERIAL" });
      continue;
    }

    const gstPercent = parseNum(row.gst_percent ?? row["GST Percent"] ?? 0);
    if (gstPercent === null || gstPercent < 0) {
      errors.push({ row: rowNum, product_name: productName, message: "GST percent is required and must be >= 0" });
      continue;
    }

    const minStockQty = parseNum(row.min_stock_quantity ?? row["Min Stock Quantity"] ?? 0);
    const minStockQuantity = minStockQty !== null && minStockQty >= 0 ? minStockQty : 0;

    const typeNameLower = (productType.name || "").toLowerCase().trim();
    const isPanel = typeNameLower === "panel";
    if (isPanel) {
      const panelType = trim(row.panel_type ?? row["Panel Type"] ?? "").toUpperCase();
      if (!panelType || !["DCR", "NON DCR"].includes(panelType)) {
        errors.push({ row: rowNum, product_name: productName, message: "Panel type must be DCR or NON DCR" });
        continue;
      }
    }

    const existing = await Product.findOne({
      where: { product_name: { [Op.iLike]: productName }, deleted_at: null },
    });
    if (existing) {
      skipped.push({ row: rowNum, product_name: productName });
      continue;
    }

    const capacity = parseNum(row.capacity ?? row["Capacity"] ?? null);
    const isActive = row.is_active === undefined && row["Is Active"] === undefined ? true : parseBool(row.is_active ?? row["Is Active"] ?? true);
    const productDescription = trim(row.product_description ?? row["Product Description"] ?? null) || null;
    const hsnSsnCode = trim(row.hsn_ssn_code ?? row["HSN/SSN Code"] ?? null) || null;
    const purchasePrice = parseNum(row.purchase_price ?? row["Purchase Price"] ?? 0);
    const sellingPrice = parseNum(row.selling_price ?? row["Selling Price"] ?? 0);
    const mrpVal = parseNum(row.mrp ?? row["MRP"] ?? 0);

    const warranty = trim(row.warranty ?? row["Warranty"] ?? null) || null;
    const material = trim(row.material ?? row["Material"] ?? null) || null;
    const panelTypeVal = trim(row.panel_type ?? row["Panel Type"] ?? null) || null;
    const panelTechName = trim(row.panel_technology_name ?? row["Panel Technology"] ?? null) || null;
    const additionalType = trim(row.additional_type ?? row["Additional Type"] ?? null) || null;
    const additionalWarranty = trim(row.additional_warranty ?? row["Additional Warranty"] ?? null) || null;
    const additionalPerfWarranty = trim(row.additional_performance_warranty ?? row["Additional Performance Warranty"] ?? null) || null;
    const acQty = parseNum(row.ac_quantity ?? row["AC Quantity"] ?? null);
    const dcQty = parseNum(row.dc_quantity ?? row["DC Quantity"] ?? null);

    const typeKey = typeNameLower.replace(/\s+/g, "_");
    const payloadProperties = { additional: { type: additionalType, warranty: additionalWarranty, performance_warranty: additionalPerfWarranty } };

    if (typeNameLower === "structure") {
      payloadProperties.structure = { material, warranty };
    } else if (typeNameLower === "panel") {
      let panelTechnologyId = null;
      if (panelTechName && panelTechByName.size) {
        const pt = panelTechByName.get(panelTechName.toLowerCase());
        panelTechnologyId = pt ? pt.id : null;
      }
      payloadProperties.panel = { type: panelTypeVal, panel_technology_id: panelTechnologyId };
    } else if (["inverter", "hybrid_inverter", "earthing", "acdb", "dcdb", "la"].includes(typeKey)) {
      payloadProperties[typeKey] = { warranty };
    } else if (typeKey === "battery") {
      const extraType = trim(row.extra_type ?? row["Extra Type"] ?? null) || null;
      payloadProperties.battery = { type: extraType, warranty };
    } else if (typeKey === "ac_cable") {
      payloadProperties.ac_cable = { ac_quantity: acQty, warranty };
    } else if (typeKey === "dc_cable") {
      payloadProperties.dc_cable = { dc_quantity: dcQty, warranty };
    }

    const payload = {
      product_type_id: productTypeId,
      product_make_id: productMakeId,
      product_name: productName,
      product_description: productDescription,
      hsn_ssn_code: hsnSsnCode,
      measurement_unit_id: measurementUnitId,
      capacity: capacity != null ? capacity : null,
      is_active: isActive,
      purchase_price: purchasePrice != null ? purchasePrice : 0,
      selling_price: sellingPrice != null ? sellingPrice : 0,
      mrp: mrpVal != null ? mrpVal : 0,
      gst_percent: gstPercent,
      min_stock_quantity: minStockQuantity,
      tracking_type: trackingType,
      serial_required: trackingType === "SERIAL",
      properties: payloadProperties,
    };

    try {
      const createdProduct = await createProduct({ payload, transaction: null });
      created.push({ row: rowNum, product_name: productName, product_id: createdProduct?.id });
    } catch (err) {
      errors.push({ row: rowNum, product_name: productName, message: err.message || String(err) });
    }
  }

  return { created: created.length, skipped: skipped.length, errors, createdRows: created, skippedRows: skipped };
}

module.exports = {
  listProducts,
  exportProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getSampleCsvBuffer,
  importProductsFromCsv,
};

