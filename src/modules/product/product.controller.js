"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const productService = require("./product.service.js");

const list = asyncHandler(async (req, res) => {
  const {
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
    visibility,
  } = req.query;
  const visibilityVal = ["active", "inactive", "all"].includes(visibility) ? visibility : "active";
  const result = await productService.listProducts({
    page: parseInt(page),
    limit: parseInt(limit),
    q,
    sortBy,
    sortOrder,
    product_name: productName,
    product_name_op: productNameOp,
    product_type_name: productTypeName,
    product_make_name: productMakeName,
    hsn_ssn_code: hsnSsnCode,
    measurement_unit_name: measurementUnitName,
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
    is_active: isActive,
    visibility: visibilityVal,
  });
  return responseHandler.sendSuccess(res, result, "Product list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const {
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
    visibility,
  } = req.query;
  const visibilityVal = ["active", "inactive", "all"].includes(visibility) ? visibility : "active";
  const buffer = await productService.exportProducts({
    q,
    sortBy,
    sortOrder,
    product_name: productName,
    product_name_op: productNameOp,
    product_type_name: productTypeName,
    product_make_name: productMakeName,
    hsn_ssn_code: hsnSsnCode,
    measurement_unit_name: measurementUnitName,
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
    is_active: isActive,
    visibility: visibilityVal,
  });
  const filename = `products-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await productService.getProductById({ id });
  if (!item) {
    return responseHandler.sendError(res, "Product not found", 404);
  }
  return responseHandler.sendSuccess(res, item, "Product fetched", 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  const created = await productService.createProduct({
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "Product created", 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = { ...req.body };
  const updated = await productService.updateProduct({
    id,
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, updated, "Product updated", 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await productService.deleteProduct({
    id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, null, "Product deactivated", 200);
});

module.exports = {
  list,
  exportList,
  getById,
  create,
  update,
  remove,
};

