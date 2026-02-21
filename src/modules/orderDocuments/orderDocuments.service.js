"use strict";

const { Op } = require("sequelize");
const { getTenantModels } = require("../tenant/tenantModels.js");

const createOrderDocument = async (payload, transaction) => {
    const models = getTenantModels();
    const { OrderDocument } = models;
    const document = await OrderDocument.create(payload, { transaction });
    return document;
};

const updateOrderDocument = async (id, updates, transaction) => {
    const models = getTenantModels();
    const { OrderDocument } = models;
    const document = await OrderDocument.findByPk(id);
    if (!document) {
        throw new Error("Document not found");
    }
    await document.update(updates, { transaction });
    return document;
};

const deleteOrderDocument = async (id, transaction) => {
    const models = getTenantModels();
    const { OrderDocument } = models;
    const document = await OrderDocument.findByPk(id);
    if (!document) {
        throw new Error("Document not found");
    }
    await document.destroy({ transaction });
    return true;
};

const getOrderDocumentById = async (id) => {
    const models = getTenantModels();
    const { OrderDocument } = models;
    const document = await OrderDocument.findByPk(id);
    return document;
};

const listOrderDocuments = async ({ order_id, page = 1, limit = 20, q = null }, transaction) => {
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

    const models = getTenantModels();
    const { OrderDocument } = models;
    const { count, rows } = await OrderDocument.findAndCountAll({
        where,
        limit,
        offset,
        order: [["created_at", "DESC"]],
        transaction,
    });

    return {
        data: rows,
        meta: {
            page,
            limit,
            total: count,
            pages: Math.ceil(count / limit),
        },
    };
};

module.exports = {
    createOrderDocument,
    updateOrderDocument,
    deleteOrderDocument,
    getOrderDocumentById,
    listOrderDocuments,
};
