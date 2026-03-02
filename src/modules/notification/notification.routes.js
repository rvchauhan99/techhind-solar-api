"use strict";

const { Router } = require("express");
const {
    list,
    unreadCount,
    markAllRead,
    markRead,
    remove,
} = require("./notification.controller.js");

const router = Router();

// GET  /api/notifications              — paginated list (own user only)
router.get("/", list);

// GET  /api/notifications/unread-count — badge count
router.get("/unread-count", unreadCount);

// PUT  /api/notifications/read-all     — mark all as read (must come BEFORE /:id)
router.put("/read-all", markAllRead);

// PUT  /api/notifications/:id/read     — mark single as read
router.put("/:id/read", markRead);

// DELETE /api/notifications/:id        — soft delete
router.delete("/:id", remove);

module.exports = router;
