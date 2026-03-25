"use strict";

const { Op } = require("sequelize");
const { getTenantModels } = require("../tenant/tenantModels.js");
const { getCurrentUser } = require("../../common/utils/requestContext.js");

const createOrderDocument = async (payload, transaction, req) => {
    const models = getTenantModels(req);
    const { OrderDocument } = models;
    const userId = req?.user?.id ?? getCurrentUser();
    const createPayload = { ...payload };

    if (userId != null) {
        if (createPayload.created_by == null) createPayload.created_by = userId;
        // Always reflect the last editor on create.
        createPayload.updated_by = userId;
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
