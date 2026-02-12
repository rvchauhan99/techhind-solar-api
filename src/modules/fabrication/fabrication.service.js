"use strict";

const db = require("../../models/index.js");
const orderService = require("../order/order.service.js");

const { Fabrication, Order, User } = db;

/**
 * Get fabrication record by order id.
 * @param {number|string} orderId
 * @returns {Promise<Object|null>}
 */
const getByOrderId = async (orderId) => {
    if (!orderId) return null;
    const row = await Fabrication.findOne({
        where: { order_id: orderId, deleted_at: null },
        include: [{ model: User, as: "fabricator", attributes: ["id", "name"], required: false }],
    });
    if (!row) return null;
    const j = row.toJSON();
    return {
        id: j.id,
        order_id: j.order_id,
        fabricator_id: j.fabricator_id,
        fabricator_name: j.fabricator?.name || null,
        fabrication_start_date: j.fabrication_start_date,
        fabrication_end_date: j.fabrication_end_date,
        structure_type: j.structure_type,
        structure_material: j.structure_material,
        coating_type: j.coating_type,
        tilt_angle: j.tilt_angle,
        height_from_roof: j.height_from_roof,
        labour_category: j.labour_category,
        labour_count: j.labour_count,
        checklist: j.checklist,
        images: j.images,
        remarks: j.remarks,
        completed_at: j.completed_at,
        created_at: j.created_at,
        updated_at: j.updated_at,
    };
};

/**
 * Create or update fabrication for an order. On complete, updates order stages.
 * @param {number|string} orderId
 * @param {Object} payload - fabrication fields + optional complete (boolean)
 * @param {Object} [options] - { transaction }
 * @returns {Promise<Object>}
 */
const createOrUpdate = async (orderId, payload, options = {}) => {
    const t = options.transaction || (await db.sequelize.transaction());
    const committedHere = !options.transaction;

    try {
        const order = await Order.findOne({
            where: { id: orderId, deleted_at: null },
            transaction: t,
        });
        if (!order) throw new Error("Order not found");

        const stages = order.stages || {};
        if (stages.planner !== "completed") {
            throw new Error("Fabrication stage is locked. Complete the Planner stage first.");
        }

        const complete = !!payload.complete;
        const data = { ...payload };
        delete data.complete;

        const fabricatorId =
            data.fabricator_id != null
                ? data.fabricator_id
                : order.fabricator_id || order.fabricator_installer_id;
        if (fabricatorId != null) data.fabricator_id = fabricatorId;

        let fabrication = await Fabrication.findOne({
            where: { order_id: orderId, deleted_at: null },
            transaction: t,
        });

        const updateFields = {
            fabrication_start_date: data.fabrication_start_date,
            fabrication_end_date: data.fabrication_end_date,
            structure_type: data.structure_type,
            structure_material: data.structure_material,
            coating_type: data.coating_type,
            tilt_angle: data.tilt_angle,
            height_from_roof: data.height_from_roof,
            labour_category: data.labour_category,
            labour_count: data.labour_count,
            checklist: data.checklist,
            images: data.images,
            remarks: data.remarks,
        };
        if (fabricatorId != null) updateFields.fabricator_id = fabricatorId;
        if (complete) updateFields.completed_at = new Date();

        if (fabrication) {
            await fabrication.update(updateFields, { transaction: t });
        } else {
            fabrication = await Fabrication.create(
                {
                    order_id: Number(orderId),
                    ...updateFields,
                },
                { transaction: t }
            );
        }

        if (complete) {
            const updatedStages = { ...stages, fabrication: "completed", installation: "pending" };
            await orderService.updateOrder({
                id: orderId,
                payload: {
                    stages: updatedStages,
                    current_stage_key: "installation",
                    fabrication_completed_at: new Date(),
                },
                transaction: t,
            });
        }

        if (committedHere) await t.commit();
        return (await getByOrderId(orderId)) || fabrication.toJSON();
    } catch (err) {
        if (committedHere) await t.rollback();
        throw err;
    }
};

module.exports = {
    getByOrderId,
    createOrUpdate,
};
