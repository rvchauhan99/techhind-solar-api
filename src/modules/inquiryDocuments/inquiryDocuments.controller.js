"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const AppError = require("../../common/errors/AppError.js");
const inquiryDocumentsService = require("./inquiryDocuments.service.js");
const bucketService = require("../../common/services/bucket.service.js");

const FILE_UNAVAILABLE_MESSAGE =
  "We couldn't save your documents right now. Please try again in a few minutes.";

const createInquiryDocument = asyncHandler(async (req, res) => {
  const payload = { ...req.body };

  if (req.file) {
    try {
      const result = await bucketService.uploadFile(req.file, {
        prefix: "inquiry-documents",
        acl: "private",
      });
      payload.document_path = result.path;
    } catch (error) {
      console.error("Error uploading document to bucket:", error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  const created = await inquiryDocumentsService.createInquiryDocument(payload, req.transaction, req);
  return responseHandler.sendSuccess(res, created, "Document uploaded successfully", 201);
});

const updateInquiryDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };

  if (req.file) {
    const existing = await inquiryDocumentsService.getInquiryDocumentById(id, req.transaction, req);
    if (existing && existing.document_path && !existing.document_path.startsWith("/")) {
      try {
        await bucketService.deleteFile(existing.document_path);
      } catch (error) {
        console.error("Error deleting old document from bucket:", error);
      }
    }
    try {
      const result = await bucketService.uploadFile(req.file, {
        prefix: "inquiry-documents",
        acl: "private",
      });
      updates.document_path = result.path;
    } catch (error) {
      console.error("Error uploading document to bucket:", error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  const updated = await inquiryDocumentsService.updateInquiryDocument(id, updates, req.transaction, req);
  return responseHandler.sendSuccess(res, updated, "Document updated successfully", 200);
});

const deleteInquiryDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const document = await inquiryDocumentsService.getInquiryDocumentById(id, req.transaction, req);
  if (document && document.document_path && !document.document_path.startsWith("/")) {
    try {
      await bucketService.deleteFile(document.document_path);
    } catch (error) {
      console.error("Error deleting document from bucket:", error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  await inquiryDocumentsService.deleteInquiryDocument(id, req.transaction, req);
  return responseHandler.sendSuccess(res, null, "Document deleted successfully", 200);
});

const getInquiryDocumentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const document = await inquiryDocumentsService.getInquiryDocumentById(id, req.transaction, req);
  return responseHandler.sendSuccess(res, document, "Document fetched successfully", 200);
});

const getDocumentUrl = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const document = await inquiryDocumentsService.getInquiryDocumentById(id, req.transaction, req);
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
    const url = await bucketService.getSignedUrl(document.document_path, 3600);
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

const listInquiryDocuments = asyncHandler(async (req, res) => {
  const { page, limit, q, inquiry_id } = req.query;
  const result = await inquiryDocumentsService.listInquiryDocuments(
    {
      inquiry_id: inquiry_id ? parseInt(inquiry_id, 10) : null,
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
  createInquiryDocument,
  updateInquiryDocument,
  deleteInquiryDocument,
  getInquiryDocumentById,
  getDocumentUrl,
  listInquiryDocuments,
};
