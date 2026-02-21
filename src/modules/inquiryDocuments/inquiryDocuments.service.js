"use strict";

const { Op } = require("sequelize");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES } = require("../../common/utils/constants.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

const createInquiryDocument = async (payload, transaction = null) => {
  const models = getTenantModels();
  const { InquiryDocument, Inquiry, OrderDocumentType } = models;
  // Validation: Check required fields
  if (!payload.inquiry_id) {
    throw new AppError("Inquiry ID is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  if (!payload.doc_type) {
    throw new AppError("Document type is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  if (!payload.document_path) {
    throw new AppError("Document path is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  // Verify inquiry exists
  const inquiry = await Inquiry.findOne({
    where: { id: payload.inquiry_id, deleted_at: null },
    transaction,
  });

  if (!inquiry) {
    throw new AppError("Inquiry not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Check if document type exists and get allow_multiple setting
  const docType = await OrderDocumentType.findOne({
    where: { type: payload.doc_type, deleted_at: null },
    transaction,
  });

  if (!docType) {
    throw new AppError("Document type not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Check if multiple documents are allowed for this type
  if (!docType.allow_multiple) {
    // Check if a document of this type already exists for this inquiry
    const existingDoc = await InquiryDocument.findOne({
      where: {
        inquiry_id: payload.inquiry_id,
        doc_type: payload.doc_type,
        deleted_at: null,
      },
      transaction,
    });

    if (existingDoc) {
      throw new AppError(
        `A document of type "${payload.doc_type}" already exists for this inquiry. Multiple documents of this type are not allowed.`,
        RESPONSE_STATUS_CODES.BAD_REQUEST
      );
    }
  }

  const createPayload = {
    inquiry_id: payload.inquiry_id,
    doc_type: payload.doc_type,
    document_path: payload.document_path,
    remarks: payload.remarks || null,
  };

  const document = await InquiryDocument.create(createPayload, { transaction });
  
  // Fetch with associations
  const createdDocument = await InquiryDocument.findOne({
    where: { id: document.id },
    include: [
      {
        model: Inquiry,
        as: "inquiry",
        attributes: ["id", "inquiry_number"],
        required: false,
      },
    ],
    transaction,
  });

  return createdDocument.toJSON();
};

const updateInquiryDocument = async (id, payload, transaction = null) => {
  const models = getTenantModels();
  const { InquiryDocument, Inquiry } = models;
  const document = await InquiryDocument.findOne({
    where: { id, deleted_at: null },
    transaction,
  });

  if (!document) {
    throw new AppError("Document not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  const updatePayload = {};
  if (payload.doc_type !== undefined) updatePayload.doc_type = payload.doc_type;
  if (payload.document_path !== undefined) updatePayload.document_path = payload.document_path;
  if (payload.remarks !== undefined) updatePayload.remarks = payload.remarks;

  await document.update(updatePayload, { transaction });

  const updatedDocument = await InquiryDocument.findOne({
    where: { id },
    include: [
      {
        model: Inquiry,
        as: "inquiry",
        attributes: ["id", "inquiry_number"],
        required: false,
      },
    ],
    transaction,
  });

  return updatedDocument.toJSON();
};

const deleteInquiryDocument = async (id, transaction = null) => {
  const models = getTenantModels();
  const { InquiryDocument } = models;
  const document = await InquiryDocument.findOne({
    where: { id, deleted_at: null },
    transaction,
  });

  if (!document) {
    throw new AppError("Document not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  await document.destroy({ transaction });
  return true;
};

const getInquiryDocumentById = async (id, transaction = null) => {
  const models = getTenantModels();
  const { InquiryDocument, Inquiry } = models;
  const document = await InquiryDocument.findOne({
    where: { id, deleted_at: null },
    include: [
      {
        model: Inquiry,
        as: "inquiry",
        attributes: ["id", "inquiry_number"],
        required: false,
      },
    ],
    transaction,
  });

  if (!document) {
    throw new AppError("Document not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  return document.toJSON();
};

const listInquiryDocuments = async ({ inquiry_id, page = 1, limit = 20, q = null }, transaction = null) => {
  const models = getTenantModels();
  const { InquiryDocument, Inquiry } = models;
  const where = { deleted_at: null };

  if (inquiry_id) {
    where.inquiry_id = inquiry_id;
  }

  if (q) {
    where[Op.or] = [
      { doc_type: { [Op.iLike]: `%${q}%` } },
      { remarks: { [Op.iLike]: `%${q}%` } },
    ];
  }

  const offset = (page - 1) * limit;

  const { count, rows } = await InquiryDocument.findAndCountAll({
    where,
    include: [
      {
        model: Inquiry,
        as: "inquiry",
        attributes: ["id", "inquiry_number"],
        required: false,
      },
    ],
    order: [["created_at", "DESC"]],
    limit,
    offset,
    transaction,
  });

  return {
    data: rows.map((row) => row.toJSON()),
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
  };
};

module.exports = {
  createInquiryDocument,
  updateInquiryDocument,
  deleteInquiryDocument,
  getInquiryDocumentById,
  listInquiryDocuments,
};

