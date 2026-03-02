"use strict";

const { Op } = require("sequelize");
const Notification = require("../../models/notification.model.js");
const { getIO } = require("../../config/socketInstance.js");

/**
 * Create a notification record and emit it via Socket.IO to the target user.
 *
 * @param {object} params
 * @param {number}  params.user_id         - Recipient user ID
 * @param {string}  params.type            - Event type key, e.g. 'lead_assigned'
 * @param {string}  params.module          - 'lead' | 'inquiry' | 'order'
 * @param {string}  params.title           - Short title shown in bell panel
 * @param {string}  params.message         - Longer description
 * @param {number}  [params.reference_id]  - FK to the related record
 * @param {string}  [params.reference_number] - Human-readable number (ORD-…, ML-…)
 * @param {string}  [params.redirect_url]  - Frontend URL for "View" action
 * @param {string}  [params.action_label]  - Button label, default "View"
 * @param {object}  [params.transaction]   - Optional Sequelize transaction
 * @returns {Promise<object>} Created notification plain object
 */
async function createAndEmit({
    user_id,
    type,
    module,
    title,
    message,
    reference_id = null,
    reference_number = null,
    redirect_url = null,
    action_label = "View",
    transaction = null,
}) {
    if (!user_id) return null;

    try {
        const notification = await Notification.create(
            {
                user_id,
                type,
                module,
                title,
                message,
                reference_id,
                reference_number,
                redirect_url,
                action_label,
                is_read: false,
            },
            { transaction }
        );

        const payload = notification.toJSON();

        // Fire and forget — don't let socket errors break the main request
        try {
            const io = getIO();
            if (io) {
                io.to(`user-${user_id}`).emit("notification", payload);
            }
        } catch (socketErr) {
            console.warn("[NotificationService] Socket emit failed:", socketErr.message);
        }

        return payload;
    } catch (err) {
        // Notification errors must never crash the main business logic
        console.error("[NotificationService] createAndEmit failed:", err.message);
        return null;
    }
}

/**
 * Emit to multiple users (bulk assign etc.)
 */
async function createAndEmitMany(notifications, transaction = null) {
    const results = await Promise.allSettled(
        (notifications || []).map((n) => createAndEmit({ ...n, transaction }))
    );
    return results.filter((r) => r.status === "fulfilled").map((r) => r.value);
}

/**
 * Paginated list of notifications for a user.
 */
async function listNotifications({ user_id, module: mod, is_read, page = 1, limit = 20 }) {
    const where = { user_id, deleted_at: null };
    if (mod) where.module = mod;
    if (is_read !== undefined && is_read !== null && is_read !== "") {
        where.is_read = is_read === true || is_read === "true" || is_read === 1;
    }

    const offset = (page - 1) * limit;
    const { rows, count } = await Notification.findAndCountAll({
        where,
        order: [["created_at", "DESC"]],
        limit: parseInt(limit, 10),
        offset,
    });

    return {
        data: rows.map((r) => r.toJSON()),
        total: count,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total_pages: Math.ceil(count / limit),
    };
}

/**
 * Count of unread notifications for a user.
 */
async function getUnreadCount({ user_id }) {
    const count = await Notification.count({
        where: { user_id, is_read: false, deleted_at: null },
    });
    return count;
}

/**
 * Mark a single notification as read.
 */
async function markRead({ id, user_id }) {
    const notification = await Notification.findOne({
        where: { id, user_id, deleted_at: null },
    });
    if (!notification) return null;
    notification.is_read = true;
    await notification.save();
    return notification.toJSON();
}

/**
 * Mark all notifications as read for a user.
 */
async function markAllRead({ user_id }) {
    const [count] = await Notification.update(
        { is_read: true },
        { where: { user_id, is_read: false, deleted_at: null } }
    );
    return { updated: count };
}

/**
 * Soft-delete a notification.
 */
async function deleteNotification({ id, user_id }) {
    const notification = await Notification.findOne({
        where: { id, user_id, deleted_at: null },
    });
    if (!notification) return false;
    await notification.destroy();
    return true;
}

module.exports = {
    createAndEmit,
    createAndEmitMany,
    listNotifications,
    getUnreadCount,
    markRead,
    markAllRead,
    deleteNotification,
};
