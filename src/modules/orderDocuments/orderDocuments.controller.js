"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const AppError = require("../../common/errors/AppError.js");
const orderDocumentsService = require("./orderDocuments.service.js");
const bucketService = require("../../common/services/bucket.service.js");

const FILE_UNAVAILABLE_MESSAGE =
  "We couldn't save your documents right now. Please try again in a few minutes.";

const createOrderDocument = asyncHandler(async (req, res) => {
  const payload = { ...req.body };

  if (req.file) {
    try {
      let bucketClient = bucketService.getBucketForRequest(req);
      let result;
      try {
        result = await bucketService.uploadFile(
          req.file,
          { prefix: "order-documents", acl: "private" },
          bucketClient
        );
      } catch (tenantErr) {
        if (bucketClient && req.tenant?.bucket) {
          bucketClient = null;
          result = await bucketService.uploadFile(req.file, {
            prefix: "order-documents",
            acl: "private",
          });
        } else {
          throw tenantErr;
        }
      }
      payload.document_path = result.path;
    } catch (error) {
      console.error("Error uploading document to bucket:", error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  const created = await orderDocumentsService.createOrderDocument(payload, req.transaction, req);
  return responseHandler.sendSuccess(res, created, "Document uploaded successfully", 201);
});

const updateOrderDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };

  if (req.file) {
    const existing = await orderDocumentsService.getOrderDocumentById(id, null, req);
    if (existing && existing.document_path && !existing.document_path.startsWith("/")) {
      try {
        const bucketClient = bucketService.getBucketForRequest(req);
        try {
          await bucketService.deleteFileWithClient(bucketClient, existing.document_path);
        } catch (e) {
          if (bucketClient && req.tenant?.bucket) {
            await bucketService.deleteFile(existing.document_path);
          } else {
            throw e;
          }
        }
      } catch (error) {
        console.error("Error deleting old document from bucket:", error);
      }
    }
    try {
      let bucketClient = bucketService.getBucketForRequest(req);
      let result;
      try {
        result = await bucketService.uploadFile(
          req.file,
          { prefix: "order-documents", acl: "private" },
          bucketClient
        );
      } catch (tenantErr) {
        if (bucketClient && req.tenant?.bucket) {
          bucketClient = null;
          result = await bucketService.uploadFile(req.file, {
            prefix: "order-documents",
            acl: "private",
          });
        } else {
          throw tenantErr;
        }
      }
      updates.document_path = result.path;
    } catch (error) {
      console.error("Error uploading document to bucket:", error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  const updated = await orderDocumentsService.updateOrderDocument(id, updates, req.transaction, req);
  return responseHandler.sendSuccess(res, updated, "Document updated successfully", 200);
});

const deleteOrderDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const document = await orderDocumentsService.getOrderDocumentById(id, null, req);
  if (document && document.document_path && !document.document_path.startsWith("/")) {
    try {
      const bucketClient = bucketService.getBucketForRequest(req);
      try {
        await bucketService.deleteFileWithClient(bucketClient, document.document_path);
      } catch (e) {
        if (bucketClient && req.tenant?.bucket) {
          await bucketService.deleteFile(document.document_path);
        } else {
          throw e;
        }
      }
    } catch (error) {
      console.error("Error deleting document from bucket:", error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  await orderDocumentsService.deleteOrderDocument(id, req.transaction, req);
  return responseHandler.sendSuccess(res, null, "Document deleted successfully", 200);
});

const getOrderDocumentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const document = await orderDocumentsService.getOrderDocumentById(id, null, req);
  return responseHandler.sendSuccess(res, document, "Document fetched successfully", 200);
});

const getDocumentUrl = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const document = await orderDocumentsService.getOrderDocumentById(id, null, req);
  if (!document) {
    return responseHandler.sendError(res, "Document not found", 404);
  }
  if (!document.document_path) {
    return responseHandler.sendError(res, "Document path not found", 404);
  }
  if (document.document_path.startsWith("/")) {
    return responseHandler.sendError(res, "Legacy document; use static URL", 400);
  }
  try {
    const url = await bucketService.getSignedUrlForRequest(req, document.document_path, 3600);
    return responseHandler.sendSuccess(
      res,
      { url, filename: document.doc_type || "document", expires_in: 3600 },
      "Signed URL generated",
      200
    );
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return responseHandler.sendError(res, FILE_UNAVAILABLE_MESSAGE, 503);
  }
});

const listOrderDocuments = asyncHandler(async (req, res) => {
  const { page, limit, q, order_id } = req.query;
  const result = await orderDocumentsService.listOrderDocuments(
    {
      order_id: order_id ? parseInt(order_id, 10) : null,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      q: q || null,
    },
    req.transaction,
    req
  );
  return responseHandler.sendSuccess(res, result, "Documents fetched successfully", 200);
});

module.exports = {
  createOrderDocument,
  updateOrderDocument,
  deleteOrderDocument,
  getOrderDocumentById,
  getDocumentUrl,
  listOrderDocuments,
};
