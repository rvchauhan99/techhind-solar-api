"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const AppError = require("../../common/errors/AppError.js");
const purchaseOrderService = require("./purchaseOrder.service.js");
const purchaseOrderPdfService = require("./pdf.service.js");
const bucketService = require("../../common/services/bucket.service.js");

const FILE_UPLOAD_UNAVAILABLE_MESSAGE =
  "We couldn't save your documents right now. Please try again in a few minutes.";

const list = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    q = null,
    status = null,
    include_closed: includeClosed = null,
    sortBy = "id",
    sortOrder = "DESC",
    po_number: poNumber = null,
    po_number_op: poNumberOp = null,
    po_date_from: poDateFrom = null,
    po_date_to: poDateTo = null,
    po_date_op: poDateOp = null,
    due_date_from: dueDateFrom = null,
    due_date_to: dueDateTo = null,
    due_date_op: dueDateOp = null,
    supplier_id: supplierId = null,
    supplier_name: supplierName = null,
    supplier_name_op: supplierNameOp = null,
    ship_to_id: shipToId = null,
    ship_to_name: shipToName = null,
    ship_to_name_op: shipToNameOp = null,
    grand_total: grandTotal = null,
    grand_total_op: grandTotalOp = null,
    grand_total_to: grandTotalTo = null,
  } = req.query;
  const includeClosedBool = includeClosed === "true" || includeClosed === true;
  const result = await purchaseOrderService.listPurchaseOrders({
    page: parseInt(page),
    limit: parseInt(limit),
    q,
    status,
    include_closed: includeClosedBool,
    sortBy,
    sortOrder,
    po_number: poNumber,
    po_number_op: poNumberOp,
    po_date_from: poDateFrom,
    po_date_to: poDateTo,
    po_date_op: poDateOp,
    due_date_from: dueDateFrom,
    due_date_to: dueDateTo,
    due_date_op: dueDateOp,
    supplier_id: supplierId,
    supplier_name: supplierName,
    supplier_name_op: supplierNameOp,
    ship_to_id: shipToId,
    ship_to_name: shipToName,
    ship_to_name_op: shipToNameOp,
    grand_total: grandTotal,
    grand_total_op: grandTotalOp,
    grand_total_to: grandTotalTo,
  });
  return responseHandler.sendSuccess(res, result, "Purchase order list fetched", 200);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await purchaseOrderService.getPurchaseOrderById({ id });
  if (!item) {
    return responseHandler.sendError(res, "Purchase order not found", 404);
  }

  // Note: Attachments are stored with path only (no direct URLs)
  // To access files, use the getAttachmentUrl endpoint which generates signed URLs (tokens)
  // This ensures private file access with time-limited tokens

  return responseHandler.sendSuccess(res, item, "Purchase order fetched", 200);
});

const generatePDF = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const po = await purchaseOrderService.getPurchaseOrderById({ id });
  if (!po) {
    return responseHandler.sendError(res, "Purchase order not found", 404);
  }

  let bucketClient = null;
  try {
    bucketClient = bucketService.getBucketForRequest(req);
  } catch (_) {
    // PDF works without bucket (logo will fallback to company name)
  }

  const pdfData = await purchaseOrderPdfService.preparePurchaseOrderPdfData(po, { bucketClient });
  const pdfBuffer = await purchaseOrderPdfService.generatePurchaseOrderPDF(pdfData);
  const filename = `PO-${po.po_number || id}.pdf`;

  if (req.tenant?.id) {
    const usageService = require("../billing/usage.service.js");
    usageService.incrementPdfGenerated(req.tenant.id).catch(() => {});
  }

  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Length": pdfBuffer.length,
    "Content-Disposition": `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
  });
  return res.end(pdfBuffer);
});

const create = asyncHandler(async (req, res) => {
  let attachments = [];
  
  // Handle file uploads if any (failure = no commit, professional error to client)
  if (req.files && req.files.length > 0) {
    try {
      const uploadedFiles = await bucketService.uploadMultipleFiles(req.files, { prefix: "purchase-orders", acl: "private" });
      attachments = uploadedFiles;
    } catch (error) {
      console.error("Error uploading files:", error);
      throw new AppError(FILE_UPLOAD_UNAVAILABLE_MESSAGE, 503);
    }
  }

  // Parse body data (items might be JSON string)
  let payload = {};
  if (typeof req.body === 'string') {
    try {
      payload = JSON.parse(req.body);
    } catch (e) {
      payload = req.body;
    }
  } else {
    payload = { ...req.body };
  }

  // Parse items if it's a string
  if (payload.items && typeof payload.items === 'string') {
    try {
      payload.items = JSON.parse(payload.items);
    } catch (e) {
      // Keep as is if parsing fails
    }
  }

  if (attachments.length > 0) {
    payload.attachments = attachments;
  }

  const created = await purchaseOrderService.createPurchaseOrder({
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, created, "Purchase order created", 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Parse body data
  let payload = {};
  if (typeof req.body === 'string') {
    try {
      payload = JSON.parse(req.body);
    } catch (e) {
      payload = req.body;
    }
  } else {
    payload = { ...req.body };
  }

  // Parse items if it's a string
  if (payload.items && typeof payload.items === 'string') {
    try {
      payload.items = JSON.parse(payload.items);
    } catch (e) {
      // Keep as is if parsing fails
    }
  }

  // Handle new file uploads if any (failure = no commit, professional error to client)
  if (req.files && req.files.length > 0) {
    try {
      const uploadedFiles = await bucketService.uploadMultipleFiles(req.files, { prefix: "purchase-orders", acl: "private" });
      
      // Get existing attachments
      const existingPO = await purchaseOrderService.getPurchaseOrderById({ id });
      const existingAttachments = existingPO?.attachments || [];
      
      // Merge new attachments with existing ones
      payload.attachments = [...existingAttachments, ...uploadedFiles];
    } catch (error) {
      console.error("Error uploading files:", error);
      throw new AppError(FILE_UPLOAD_UNAVAILABLE_MESSAGE, 503);
    }
  }

  const updated = await purchaseOrderService.updatePurchaseOrder({
    id,
    payload,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, updated, "Purchase order updated", 200);
});

const approve = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const approved = await purchaseOrderService.approvePurchaseOrder({
    id,
    approved_by: req.user.id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, approved, "Purchase order approved", 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Get PO to delete attachments from bucket (failure = no commit, professional error to client)
  const po = await purchaseOrderService.getPurchaseOrderById({ id });
  if (po && po.attachments && po.attachments.length > 0) {
    const filePaths = po.attachments.map(att => att.path).filter(Boolean);
    if (filePaths.length > 0) {
      try {
        await bucketService.deleteMultipleFiles(filePaths);
      } catch (error) {
        console.error("Error deleting attachments:", error);
        throw new AppError(FILE_UPLOAD_UNAVAILABLE_MESSAGE, 503);
      }
    }
  }
  
  await purchaseOrderService.deletePurchaseOrder({
    id,
    transaction: req.transaction,
  });
  return responseHandler.sendSuccess(res, null, "Purchase order deleted", 200);
});

const deleteAttachment = asyncHandler(async (req, res) => {
  const { id, attachmentIndex } = req.params;
  
  // Get PO
  const po = await purchaseOrderService.getPurchaseOrderById({ id });
  if (!po) {
    return responseHandler.sendError(res, "Purchase order not found", 404);
  }

  const attachments = po.attachments || [];
  const index = parseInt(attachmentIndex);
  
  if (index < 0 || index >= attachments.length) {
    return responseHandler.sendError(res, "Invalid attachment index", 400);
  }

  const attachment = attachments[index];
  
  // Delete file from bucket (failure = no commit, professional error to client)
  if (attachment.path) {
    try {
      await bucketService.deleteFile(attachment.path);
    } catch (error) {
      console.error("Error deleting file from bucket:", error);
      throw new AppError(FILE_UPLOAD_UNAVAILABLE_MESSAGE, 503);
    }
  }

  // Remove attachment from array
  attachments.splice(index, 1);
  
  // Update PO
  const updated = await purchaseOrderService.updatePurchaseOrder({
    id,
    payload: { attachments },
    transaction: req.transaction,
  });
  
  return responseHandler.sendSuccess(res, updated, "Attachment deleted", 200);
});

const getAttachmentUrl = asyncHandler(async (req, res) => {
  const { id, attachmentIndex } = req.params;
  
  // Get PO
  const po = await purchaseOrderService.getPurchaseOrderById({ id });
  if (!po) {
    return responseHandler.sendError(res, "Purchase order not found", 404);
  }

  const attachments = po.attachments || [];
  const index = parseInt(attachmentIndex);
  
  if (index < 0 || index >= attachments.length) {
    return responseHandler.sendError(res, "Invalid attachment index", 400);
  }

  const attachment = attachments[index];
  
  // Generate signed URL (token-based access for private files)
  if (attachment.path) {
    try {
      // Generate signed URL valid for 1 hour (3600 seconds)
      const signedUrl = await bucketService.getSignedUrl(attachment.path, 3600);
      return responseHandler.sendSuccess(res, { 
        url: signedUrl,
        filename: attachment.filename,
        expires_in: 3600
      }, "Signed URL generated", 200);
    } catch (error) {
      console.error("Error generating signed URL:", error);
      return responseHandler.sendError(res, FILE_UPLOAD_UNAVAILABLE_MESSAGE, 503);
    }
  }
  
  return responseHandler.sendError(res, "Attachment path not found", 404);
});

const exportList = asyncHandler(async (req, res) => {
  const {
    q = null,
    status = null,
    include_closed: includeClosed = null,
    sortBy = "id",
    sortOrder = "DESC",
    po_number: poNumber = null,
    po_number_op: poNumberOp = null,
    po_date_from: poDateFrom = null,
    po_date_to: poDateTo = null,
    po_date_op: poDateOp = null,
    due_date_from: dueDateFrom = null,
    due_date_to: dueDateTo = null,
    due_date_op: dueDateOp = null,
    supplier_id: supplierId = null,
    supplier_name: supplierName = null,
    supplier_name_op: supplierNameOp = null,
    ship_to_id: shipToId = null,
    ship_to_name: shipToName = null,
    ship_to_name_op: shipToNameOp = null,
    grand_total: grandTotal = null,
    grand_total_op: grandTotalOp = null,
    grand_total_to: grandTotalTo = null,
  } = req.query;
  const includeClosedBool = includeClosed === "true" || includeClosed === true;
  const buffer = await purchaseOrderService.exportPurchaseOrders({
    q,
    status,
    include_closed: includeClosedBool,
    sortBy,
    sortOrder,
    po_number: poNumber,
    po_number_op: poNumberOp,
    po_date_from: poDateFrom,
    po_date_to: poDateTo,
    po_date_op: poDateOp,
    due_date_from: dueDateFrom,
    due_date_to: dueDateTo,
    due_date_op: dueDateOp,
    supplier_id: supplierId,
    supplier_name: supplierName,
    supplier_name_op: supplierNameOp,
    ship_to_id: shipToId,
    ship_to_name: shipToName,
    ship_to_name_op: shipToNameOp,
    grand_total: grandTotal,
    grand_total_op: grandTotalOp,
    grand_total_to: grandTotalTo,
  });
  const filename = `purchase-orders-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

module.exports = {
  list,
  exportList,
  getById,
  generatePDF,
  create,
  update,
  approve,
  remove,
  deleteAttachment,
  getAttachmentUrl,
};

