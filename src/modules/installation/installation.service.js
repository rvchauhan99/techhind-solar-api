"use strict";

const orderService = require("../order/order.service.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const { assertActiveUserIds } = require("../../common/utils/activeUserGuard.js");

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

        // 1. Reconciliation Logic
        const installationScans = data.installation_scans || {}; // { product_id: [serial1, serial2] }
        const forceAdjust = !!data.force_adjust;
        const forceAdjustReason = data.force_adjust_reason || "";

        if (complete) {
            // A. Determine required counts from order.bom_snapshot (shipped/delivered qty)
            const deliveredSerialsMap = await challanService.getOrderDeliveredSerials(orderId);
            const requiredProducts = Object.keys(deliveredSerialsMap);

            const mismatches = [];
            const adjustments = [];

            for (const pid of requiredProducts) {
                const deliveredSerials = deliveredSerialsMap[pid] || [];
                const scannedSerials = installationScans[pid] || [];
                const requiredCount = deliveredSerials.length;

                if (scannedSerials.length !== requiredCount) {
                    throw new Error(`Product #${pid}: Required ${requiredCount} scans, but got ${scannedSerials.length}`);
                }

                // Compare scanned vs delivered
                const deliveredSerialNumbers = deliveredSerials.map(s => s.serial_number.toLowerCase());
                const scannedSerialNumbers = scannedSerials.map(s => s.toLowerCase());

                const missingFromDelivered = scannedSerialNumbers.filter(sn => !deliveredSerialNumbers.includes(sn));
                const extraInDelivered = deliveredSerialNumbers.filter(sn => !scannedSerialNumbers.includes(sn));

                if (missingFromDelivered.length > 0) {
                    if (!forceAdjust) {
                        mismatches.push({
                            product_id: pid,
                            missing_serials: missingFromDelivered,
                            expected_serials: extraInDelivered,
                        });
                    } else {
                        // Prepare adjustments for force-adjust
                        adjustments.push({
                            product_id: pid,
                            to_issue: missingFromDelivered,
                            to_return: extraInDelivered,
                        });
                    }
                }
            }

            if (mismatches.length > 0) {
                const error = new Error("Serial mismatch detected");
                error.statusCode = 400;
                error.code = "SERIAL_MISMATCH";
                error.mismatches = mismatches;
                error.can_force_adjust = true;
                throw error;
            }

            // B. Execute Force Adjustments if requested
            if (forceAdjust && adjustments.length > 0) {
                if (!forceAdjustReason) {
                    throw new Error("Force adjust reason is required");
                }
                const { StockSerial, ChallanItemSerial, Stock } = models;

                for (const adj of adjustments) {
                    const pid = adj.product_id;
                    const product = await models.Product.findByPk(pid, { transaction: t });
                    
                    // 1. Return expected-but-not-installed serials to AVAILABLE
                    for (const sn of adj.to_return) {
                        const ss = await StockSerial.findOne({
                            where: { serial_number: { [Op.iLike]: sn }, product_id: pid, status: SERIAL_STATUS.ISSUED },
                            transaction: t,
                            lock: t.LOCK.UPDATE,
                        });
                        if (ss) {
                            const warehouseId = ss.warehouse_id;
                            const stock = await Stock.findOne({ where: { product_id: pid, warehouse_id: warehouseId }, transaction: t });
                            
                            await ss.update({
                                status: SERIAL_STATUS.AVAILABLE,
                                outward_date: null,
                                source_type: null,
                                source_id: null,
                                issued_against: null,
                                reference_number: null,
                            }, { transaction: t });

                            // Increment stock back
                            if (stock) {
                                await stock.update({
                                    quantity_available: Number(stock.quantity_available) + 1,
                                    quantity_on_hand: Number(stock.quantity_on_hand) + 1,
                                }, { transaction: t });
                            }

                            // Deactivate old challan link
                            await ChallanItemSerial.update({ is_active: false }, {
                                where: { order_id: orderId, product_id: pid, serial_number: { [Op.iLike]: sn } },
                                transaction: t,
                            });
                        }
                    }

                    // 2. Issue actually-installed-but-not-delivered serials
                    for (const sn of adj.to_issue) {
                        const ss = await StockSerial.findOne({
                            where: { serial_number: { [Op.iLike]: sn }, product_id: pid, status: SERIAL_STATUS.AVAILABLE },
                            transaction: t,
                            lock: t.LOCK.UPDATE,
                        });
                        if (!ss) {
                            throw new Error(`Serial '${sn}' for product #${pid} is not available in stock for force-adjust`);
                        }

                        const warehouseId = ss.warehouse_id;
                        const stock = await Stock.findOne({ where: { product_id: pid, warehouse_id: warehouseId }, transaction: t });

                        await ss.update({
                            status: SERIAL_STATUS.ISSUED,
                            outward_date: new Date(),
                            source_type: TRANSACTION_TYPE.INSTALLATION_FORCE_ADJUST,
                            source_id: orderId,
                            issued_against: "customer_order",
                            reference_number: order.order_number,
                        }, { transaction: t });

                        // Decrement stock
                        if (stock) {
                            await stock.update({
                                quantity_available: Number(stock.quantity_available) - 1,
                                quantity_on_hand: Number(stock.quantity_on_hand) - 1,
                            }, { transaction: t });
                        }

                        // Create new normalized challan link (link to the latest active challan for this order/product)
                        const latestChallanItem = await models.ChallanItems.findOne({
                            include: [{ model: models.Challan, as: "challan", where: { order_id: orderId, deleted_at: null, is_reversed: false } }],
                            where: { product_id: pid },
                            order: [["id", "DESC"]],
                            transaction: t,
                        });

                        if (latestChallanItem) {
                            await ChallanItemSerial.create({
                                challan_id: latestChallanItem.challan_id,
                                challan_item_id: latestChallanItem.id,
                                order_id: orderId,
                                product_id: pid,
                                serial_number: sn,
                                stock_serial_id: ss.id,
                                source: "installation_force_adjust",
                                is_active: true,
                                remarks: forceAdjustReason,
                            }, { transaction: t });
                        }
                    }
                }
            }
        }

        const installerId = data.installer_id != null ? data.installer_id : order.installer_id || order.fabricator_installer_id;
        if (installerId != null) data.installer_id = installerId;

        await assertActiveUserIds(installerId, {
            transaction: t,
            models,
            fieldLabel: "Installer",
        });

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
