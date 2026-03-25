"use strict";

const { Op } = require("sequelize");
const { getTenantModels } = require("../tenant/tenantModels.js");
const { getCurrentUser } = require("../../common/utils/requestContext.js");
const bucketService = require("../../common/services/bucket.service.js");

function parseAllowMultiple(value) {
    if (value === true || value === 1 || value === "1") return true;
    if (value === false || value === 0 || value === "0") return false;
    if (typeof value === "string") {
        const s = value.trim().toLowerCase();
        if (["true", "yes", "y", "allow", "multiple"].includes(s)) return true;
        if (["false", "no", "n", "deny"].includes(s)) return false;
    }
    return Boolean(value);
}

const createOrderDocument = async (payload, transaction, req) => {
    const models = getTenantModels(req);
    const { OrderDocument, OrderDocumentType } = models;
    const userId = req?.user?.id ?? getCurrentUser();
    const createPayload = { ...payload };

    if (userId != null) {
        if (createPayload.created_by == null) createPayload.created_by = userId;
        // Always reflect the last editor on create.
        createPayload.updated_by = userId;
    }

    // Master config: allow_multiple controls whether duplicates are allowed for this doc_type.
    const docTypeRow = await OrderDocumentType.findOne({
        where: { type: payload.doc_type, deleted_at: null },
        transaction,
    });
    const allowMultiple = parseAllowMultiple(docTypeRow?.allow_multiple);

    if (!allowMultiple) {
        // Find the latest existing doc for this (order_id, doc_type), then update in place.
        const existingDocs = await OrderDocument.findAll({
            where: { order_id: payload.order_id, doc_type: payload.doc_type, deleted_at: null },
            order: [["created_at", "DESC"]],
            transaction,
        });

        if (existingDocs && existingDocs.length > 0) {
            const target = existingDocs[0];
            const bucketClient = req ? bucketService.getBucketForRequest(req) : null;

            // Delete bucket objects for all previous docs (best-effort).
            await Promise.all(
                existingDocs.map(async (d) => {
                    const key = d?.document_path;
                    if (!bucketClient) return;
                    if (!key || String(key).startsWith("/")) return; // legacy/static
                    try {
                        await bucketService.deleteFileWithClient(bucketClient, key);
                    } catch (e) {
                        // ignore deletion failure; DB will still point to new document_path
                    }
                })
            );

            await target.update(
                {
                    document_path: createPayload.document_path,
                    remarks: createPayload.remarks ?? null,
                    updated_by: userId ?? target.updated_by,
                },
                { transaction }
            );

            // Remove any additional duplicates (we keep only the latest row, which we updated above).
            for (const extra of existingDocs.slice(1)) {
                await extra.destroy({ transaction });
            }

            return target;
        }
    }

    const document = await OrderDocument.create(createPayload, { transaction });
    return document;
};

const updateOrderDocument = async (id, updates, transaction, req) => {
    const models = getTenantModels(req);
    const { OrderDocument } = models;
    const document = await OrderDocument.findByPk(id);
    if (!document) {
        throw new Error("Document not found");
    }
    const userId = req?.user?.id ?? getCurrentUser();
    if (userId != null) {
        // Always reflect the last editor on update.
        updates.updated_by = userId;
    }
    await document.update(updates, { transaction });
    return document;
};

const deleteOrderDocument = async (id, transaction, req) => {
    const models = getTenantModels(req);
    const { OrderDocument } = models;
    const document = await OrderDocument.findByPk(id);
    if (!document) {
        throw new Error("Document not found");
    }
    await document.destroy({ transaction });
    return true;
};

const getOrderDocumentById = async (id, transaction, req) => {
    const models = getTenantModels(req);
    const { OrderDocument } = models;
    const document = await OrderDocument.findByPk(id);
    return document;
};

const listOrderDocuments = async ({ order_id, page = 1, limit = 20, q = null }, transaction, req) => {
    const offset = (page - 1) * limit;

    const where = {
        deleted_at: null,
    };

    if (order_id) {
        where.order_id = order_id;
    }

    if (q) {
        where[Op.or] = [
            { doc_type: { [Op.iLike]: `%${q}%` } },
            { remarks: { [Op.iLike]: `%${q}%` } },
        ];
    }

    const models = getTenantModels(req);
    const { OrderDocument, User } = models;
    const { count, rows } = await OrderDocument.findAndCountAll({
        where,
        limit,
        offset,
        order: [["created_at", "DESC"]],
        include: [
            {
                model: User,
                as: "updatedByUser",
                attributes: ["id", "name"],
                required: false,
            },
            {
                model: User,
                as: "createdByUser",
                attributes: ["id", "name"],
                required: false,
            },
        ],
        transaction,
    });

    const rowsData = rows.map((row) => {
        const obj = row?.toJSON ? row.toJSON() : row;
        obj.updated_by_name = obj.updatedByUser?.name ?? obj.createdByUser?.name ?? null;
        return obj;
    });

    return {
        data: rowsData,
        meta: {
            page,
            limit,
            total: count,
            pages: Math.ceil(count / limit),
        },
    };
};

const getLatestOrderDocumentByType = async (orderId, docType, transaction, req) => {
    const models = getTenantModels(req);
    const { OrderDocument } = models;
    const document = await OrderDocument.findOne({
        where: {
            order_id: orderId,
            doc_type: docType,
            deleted_at: null,
        },
        order: [["created_at", "DESC"]],
        transaction,
    });
    return document;
};

module.exports = {
    createOrderDocument,
    updateOrderDocument,
    deleteOrderDocument,
    getOrderDocumentById,
    listOrderDocuments,
    getLatestOrderDocumentByType,
};
