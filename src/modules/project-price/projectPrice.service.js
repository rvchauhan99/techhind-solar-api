"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { Op } = require("sequelize");

const { ProjectPrice, State, ProjectScheme, OrderType, BillOfMaterial, Product, ProductType } = db;

const listProjectPrices = async ({
  page = 1,
  limit = 20,
  q = null,
  sortBy = "created_at",
  sortOrder = "DESC",
  state_name = null,
  project_for_name = null,
  order_type_name = null,
  bill_of_material_name = null,
  project_capacity,
  project_capacity_op,
  project_capacity_to,
  total_project_value,
  total_project_value_op,
  total_project_value_to,
  system_warranty = null,
  is_locked = null,
} = {}) => {
  const offset = (page - 1) * limit;

  const where = {
    deleted_at: null,
  };

  const addNumCond = (field, val, valTo, opStr) => {
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
    if (Reflect.ownKeys(cond).length > 0) where[field] = cond;
  };
  addNumCond("project_capacity", project_capacity, project_capacity_to, project_capacity_op);
  addNumCond("total_project_value", total_project_value, total_project_value_to, total_project_value_op);

  if (system_warranty) where.system_warranty = { [Op.iLike]: `%${system_warranty}%` };
  if (is_locked !== undefined && is_locked !== "" && is_locked !== null) {
    where.is_locked = is_locked === "true" || is_locked === true;
  }

  const stateInclude = {
    model: State,
    as: "state",
    attributes: ["id", "name"],
    required: !!state_name,
    ...(state_name && { where: { name: { [Op.iLike]: `%${state_name}%` } } }),
  };
  const projectSchemeInclude = {
    model: ProjectScheme,
    as: "projectScheme",
    attributes: ["id", "name"],
    required: !!project_for_name,
    ...(project_for_name && { where: { name: { [Op.iLike]: `%${project_for_name}%` } } }),
  };
  const orderTypeInclude = {
    model: OrderType,
    as: "orderType",
    attributes: ["id", "name"],
    required: !!order_type_name,
    ...(order_type_name && { where: { name: { [Op.iLike]: `%${order_type_name}%` } } }),
  };
  const billOfMaterialInclude = {
    model: BillOfMaterial,
    as: "billOfMaterial",
    attributes: ["id", "bom_name"],
    required: !!bill_of_material_name,
    ...(bill_of_material_name && { where: { bom_name: { [Op.iLike]: `%${bill_of_material_name}%` } } }),
  };

  if (q) {
    const numericValue = parseFloat(q);
    const orConditions = [];

    if (!isNaN(numericValue)) {
      orConditions.push(
        { project_capacity: { [Op.eq]: numericValue } },
        { total_project_value: { [Op.eq]: numericValue } },
        { state_subsidy: { [Op.eq]: numericValue } },
        { structure_amount: { [Op.eq]: numericValue } },
        { netmeter_amount: { [Op.eq]: numericValue } },
        { subsidy_amount: { [Op.eq]: numericValue } }
      );
    }

    where[Op.and] = [
      { deleted_at: null },
      {
        [Op.or]: orConditions,
      },
    ];
  }

  const { count, rows } = await ProjectPrice.findAndCountAll({
    where,
    include: [
      stateInclude,
      projectSchemeInclude,
      orderTypeInclude,
      billOfMaterialInclude,
    ],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  const data = rows.map((item) => {
    const row = item.toJSON();
    return {
      id: row.id,
      state_id: row.state_id,
      state_name: row.state?.name || null,
      project_for_id: row.project_for_id,
      project_for_name: row.projectScheme?.name || null,
      order_type_id: row.order_type_id,
      order_type_name: row.orderType?.name || null,
      bill_of_material_id: row.bill_of_material_id,
      bill_of_material_name: row.billOfMaterial?.bom_name || null,
      project_capacity: row.project_capacity,
      price_per_kwa: row.price_per_kwa,
      total_project_value: row.total_project_value,
      state_subsidy: row.state_subsidy,
      structure_amount: row.structure_amount,
      netmeter_amount: row.netmeter_amount,
      subsidy_amount: row.subsidy_amount,
      system_warranty: row.system_warranty,
      is_locked: row.is_locked,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  return { data, meta: {
      page,
      limit,
      total: count,
      pages: limit > 0 ? Math.ceil(count / limit) : 0,
    },
  };
};

const exportProjectPrices = async (params = {}) => {
  const { data } = await listProjectPrices({ ...params, page: 1, limit: 10000 });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Project Prices");
  worksheet.columns = [
    { header: "State", key: "state_name", width: 18 },
    { header: "Project For", key: "project_for_name", width: 18 },
    { header: "Order Type", key: "order_type_name", width: 18 },
    { header: "BOM", key: "bill_of_material_name", width: 22 },
    { header: "Capacity", key: "project_capacity", width: 12 },
    { header: "Price/KwA", key: "price_per_kwa", width: 12 },
    { header: "Total Value", key: "total_project_value", width: 14 },
    { header: "Created At", key: "created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
  (data || []).forEach((p) => {
    worksheet.addRow({
      state_name: p.state_name || "",
      project_for_name: p.project_for_name || "",
      order_type_name: p.order_type_name || "",
      bill_of_material_name: p.bill_of_material_name || "",
      project_capacity: p.project_capacity ?? "",
      price_per_kwa: p.price_per_kwa ?? "",
      total_project_value: p.total_project_value ?? "",
      created_at: p.created_at ? new Date(p.created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

const getProjectPriceById = async ({ id } = {}) => {
  if (!id) return null;

  const item = await ProjectPrice.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: State, as: "state", attributes: ["id", "name"] },
      { model: ProjectScheme, as: "projectScheme", attributes: ["id", "name"] },
      { model: OrderType, as: "orderType", attributes: ["id", "name"] },
      { model: BillOfMaterial, as: "billOfMaterial", attributes: ["id", "bom_name"] },
    ],
  });

  if (!item) return null;

  const row = item.toJSON();
  return {
    id: row.id,
    state_id: row.state_id,
    project_for_id: row.project_for_id,
    order_type_id: row.order_type_id,
    bill_of_material_id: row.bill_of_material_id,
    project_capacity: row.project_capacity,
    price_per_kwa: row.price_per_kwa,
    total_project_value: row.total_project_value,
    state_subsidy: row.state_subsidy,
    structure_amount: row.structure_amount,
    netmeter_amount: row.netmeter_amount,
    subsidy_amount: row.subsidy_amount,
    system_warranty: row.system_warranty,
    is_locked: row.is_locked,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const createProjectPrice = async ({ payload, transaction } = {}) => {
  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const data = {
      state_id: payload.state_id,
      project_for_id: payload.project_for_id,
      order_type_id: payload.order_type_id,
      bill_of_material_id: payload.bill_of_material_id || null,
      project_capacity: payload.project_capacity,
      price_per_kwa: payload.price_per_kwa,
      total_project_value: payload.total_project_value,
      state_subsidy: payload.state_subsidy || null,
      structure_amount: payload.structure_amount || null,
      netmeter_amount: payload.netmeter_amount || null,
      subsidy_amount: payload.subsidy_amount || null,
      system_warranty: payload.system_warranty || null,
      is_locked: payload.is_locked !== undefined ? payload.is_locked : false,
    };

    const created = await ProjectPrice.create(data, { transaction: t });

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

const updateProjectPrice = async ({ id, payload, transaction } = {}) => {
  if (!id) return null;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const item = await ProjectPrice.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!item) {
      throw new Error("Project Price not found");
    }

    await item.update(
      {
        state_id: payload.state_id ?? item.state_id,
        project_for_id: payload.project_for_id ?? item.project_for_id,
        order_type_id: payload.order_type_id ?? item.order_type_id,
        bill_of_material_id:
          payload.bill_of_material_id !== undefined ? payload.bill_of_material_id : item.bill_of_material_id,
        project_capacity:
          payload.project_capacity !== undefined ? payload.project_capacity : item.project_capacity,
        total_project_value:
          payload.total_project_value !== undefined ? payload.total_project_value : item.total_project_value,
        state_subsidy:
          payload.state_subsidy !== undefined ? payload.state_subsidy : item.state_subsidy,
        structure_amount:
          payload.structure_amount !== undefined ? payload.structure_amount : item.structure_amount,
        netmeter_amount:
          payload.netmeter_amount !== undefined ? payload.netmeter_amount : item.netmeter_amount,
        subsidy_amount:
          payload.subsidy_amount !== undefined ? payload.subsidy_amount : item.subsidy_amount,
        system_warranty:
          payload.system_warranty !== undefined ? payload.system_warranty : item.system_warranty,
        is_locked: payload.is_locked !== undefined ? payload.is_locked : item.is_locked,
        price_per_kwa: payload.price_per_kwa !== undefined ? payload.price_per_kwa : item.price_per_kwa,
      },
      { transaction: t }
    );

    if (committedHere) {
      await t.commit();
    }

    return item.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const deleteProjectPrice = async ({ id, transaction } = {}) => {
  if (!id) return false;

  const t = transaction || (await db.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const item = await ProjectPrice.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });

    if (!item) {
      throw new Error("Project Price not found");
    }

    await item.destroy({ transaction: t });

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

const bomDetails = async () => {
  let datas = await BillOfMaterial.findAll({ attributes: ['id', 'bom_name', 'bom_detail'] });

  // Get all unique product_ids from all bom_details
  const allProductIds = [...new Set(
    datas.flatMap(bom => (bom.bom_detail || []).map(detail => detail.product_id))
  )].filter(Boolean);

  // Fetch all products in one query
  const products = await Product.findAll({
    where: { id: allProductIds },
    attributes: ['id', 'product_type_id', 'product_name', 'product_description', 'capacity', 'hsn_ssn_code', 'gst_percent']
  });

  // Get all unique product_type_ids from products
  const allProductTypeIds = [...new Set(
    products.map(product => product.product_type_id)
  )].filter(Boolean);

  // Fetch all product types in one query
  const productTypes = await ProductType.findAll({
    where: { id: allProductTypeIds },
    attributes: ['id', 'name', 'display_order']
  });

  // Create a map for quick product type lookup
  const productTypeMap = productTypes.reduce((map, productType) => {
    map[productType.id] = productType.toJSON();
    return map;
  }, {});

  // Create a map for quick product lookup with product_type included
  const productMap = products.reduce((map, product) => {
    const productJson = product.toJSON();
    productJson.product_type = productTypeMap[productJson.product_type_id] || null;
    map[product.id] = productJson;
    return map;
  }, {});

  // Enrich bom_detail with product information
  const enrichedData = datas.map(bom => {
    const bomJson = bom.toJSON();
    bomJson.bom_detail = (bomJson.bom_detail || []).map(detail => ({
      ...detail,
      product: productMap[detail.product_id] || null
    }));
    return bomJson;
  });

  return enrichedData;
};

module.exports = {
  listProjectPrices,
  exportProjectPrices,
  getProjectPriceById,
  createProjectPrice,
  updateProjectPrice,
  deleteProjectPrice,
  bomDetails
};
