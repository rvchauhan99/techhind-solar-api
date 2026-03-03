"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const notificationService = require("./notification.service.js");

/**
 * GET /api/notifications
 * Query params: module, is_read, page, limit
 */
const list = asyncHandler(async (req, res) => {
    const user_id = req.user?.id;
    const { module: mod, is_read, page = 1, limit = 20 } = req.query;
    const result = await notificationService.listNotifications({
        req,
        user_id,
        module: mod || null,
        is_read: is_read !== undefined ? is_read : null,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
    });
    return responseHandler.sendSuccess(res, result, "Notifications fetched", 200);
});

/**
 * GET /api/notifications/unread-count
 */
const unreadCount = asyncHandler(async (req, res) => {
    const user_id = req.user?.id;
    const count = await notificationService.getUnreadCount({ req, user_id });
    return responseHandler.sendSuccess(res, { count }, "Unread count fetched", 200);
});

/**
 * PUT /api/notifications/read-all
 */
const markAllRead = asyncHandler(async (req, res) => {
    const user_id = req.user?.id;
    const result = await notificationService.markAllRead({ req, user_id });
    return responseHandler.sendSuccess(res, result, "All notifications marked as read", 200);
});

/**
 * PUT /api/notifications/:id/read
 */
const markRead = asyncHandler(async (req, res) => {
    const user_id = req.user?.id;
    const { id } = req.params;
    const notification = await notificationService.markRead({ req, id, user_id });
    if (!notification) {
        return responseHandler.sendError(res, "Notification not found", 404);
    }
    return responseHandler.sendSuccess(res, notification, "Notification marked as read", 200);
});

/**
 * DELETE /api/notifications/:id
 */
const remove = asyncHandler(async (req, res) => {
    const user_id = req.user?.id;
    const { id } = req.params;
    const deleted = await notificationService.deleteNotification({ req, id, user_id });
    if (!deleted) {
        return responseHandler.sendError(res, "Notification not found", 404);
    }
    return responseHandler.sendSuccess(res, true, "Notification deleted", 200);
});

module.exports = { list, unreadCount, markAllRead, markRead, remove };
