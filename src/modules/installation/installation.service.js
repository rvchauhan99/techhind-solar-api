"use strict";

const orderService = require("../order/order.service.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

/**
 * Get installation record by order id.
 * @param {number|string} orderId
 * @returns {Promise<Object|null>}
 */
const getByOrderId = async (orderId) => {
    if (!orderId) return null;
    const models = getTenantModels();
    const { Installation, User } = models;
    const row = await Installation.findOne({
        where: { order_id: orderId, deleted_at: null },
        include: [{ model: User, as: "installer", attributes: ["id", "name"], required: false }],
    });
    if (!row) return null;
    const j = row.toJSON();
    return {
        id: j.id,
        order_id: j.order_id,
        installer_id: j.installer_id,
        installer_name: j.installer?.name || null,
        installation_start_date: j.installation_start_date,
        installation_end_date: j.installation_end_date,
        inverter_installation_location: j.inverter_installation_location,
        earthing_type: j.earthing_type,
        wiring_type: j.wiring_type,
        acdb_dcdb_make: j.acdb_dcdb_make,
        panel_mounting_type: j.panel_mounting_type,
        netmeter_readiness_status: j.netmeter_readiness_status,
        total_panels_installed: j.total_panels_installed,
        inverter_serial_no: j.inverter_serial_no,
        panel_serial_numbers: j.panel_serial_numbers,
        earthing_resistance: j.earthing_resistance,
        initial_generation: j.initial_generation,
        checklist: j.checklist,
        images: j.images,
        remarks: j.remarks,
        completed_at: j.completed_at,
        created_at: j.created_at,
        updated_at: j.updated_at,
    };
};

/**
 * Create or update installation for an order. On complete, updates order stages.
 * @param {number|string} orderId
 * @param {Object} payload - installation fields + optional complete (boolean)
 * @param {Object} [options] - { transaction }
 * @returns {Promise<Object>}
 */
const createOrUpdate = async (orderId, payload, options = {}) => {
    const models = getTenantModels();
    const { Installation, Order } = models;
    const t = options.transaction || (await models.sequelize.transaction());
    const committedHere = !options.transaction;

    try {
        const order = await Order.findOne({
            where: { id: orderId, deleted_at: null },
            transaction: t,
        });
        if (!order) throw new Error("Order not found");

        const stages = order.stages || {};
        if (stages.fabrication !== "completed") {
            throw new Error("Installation stage is locked. Complete the Fabrication stage first.");
        }

        const complete = !!payload.complete;
        const data = { ...payload };
        delete data.complete;

        const installerId = data.installer_id != null ? data.installer_id : order.installer_id || order.fabricator_installer_id;
        if (installerId != null) data.installer_id = installerId;

        let installation = await Installation.findOne({
            where: { order_id: orderId, deleted_at: null },
            transaction: t,
        });

        const updateFields = {
            installation_start_date: data.installation_start_date,
            installation_end_date: data.installation_end_date,
            inverter_installation_location: data.inverter_installation_location,
            earthing_type: data.earthing_type,
            wiring_type: data.wiring_type,
            acdb_dcdb_make: data.acdb_dcdb_make,
            panel_mounting_type: data.panel_mounting_type,
            netmeter_readiness_status: data.netmeter_readiness_status,
            total_panels_installed: data.total_panels_installed,
            inverter_serial_no: data.inverter_serial_no,
            panel_serial_numbers: data.panel_serial_numbers,
            earthing_resistance: data.earthing_resistance,
            initial_generation: data.initial_generation,
            checklist: data.checklist,
            images: data.images,
            remarks: data.remarks,
        };
        if (installerId != null) updateFields.installer_id = installerId;
        if (complete) updateFields.completed_at = new Date();

        if (installation) {
            await installation.update(updateFields, { transaction: t });
        } else {
            installation = await Installation.create(
                {
                    order_id: Number(orderId),
                    ...updateFields,
                },
                { transaction: t }
            );
        }

        if (complete) {
            const updatedStages = { ...stages, installation: "completed", netmeter_apply: "pending" };
            await orderService.updateOrder({
                id: orderId,
                payload: {
                    stages: updatedStages,
                    current_stage_key: "netmeter_apply",
                    installation_completed_at: new Date(),
                },
                transaction: t,
            });
        }

        if (committedHere) await t.commit();
        return (await getByOrderId(orderId)) || installation.toJSON();
    } catch (err) {
        if (committedHere) await t.rollback();
        throw err;
    }
};

module.exports = {
    getByOrderId,
    createOrUpdate,
};
