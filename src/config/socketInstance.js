"use strict";

/**
 * Socket.IO singleton — allows any module (service, controller) to emit
 * events without importing the HTTP server or creating circular dependencies.
 *
 * Usage:
 *   const { getIO } = require('../config/socketInstance');
 *   getIO()?.to(`user-${userId}`).emit('notification', payload);
 */

let _io = null;

/**
 * Called once in server.js after Socket.IO server is initialised.
 * @param {import('socket.io').Server} io
 */
function setIO(io) {
    _io = io;
}

/**
 * Returns the Socket.IO server instance, or null if not yet initialised.
 * Safe to call: callers should guard with `getIO()?.emit(...)`.
 * @returns {import('socket.io').Server|null}
 */
function getIO() {
    return _io;
}

module.exports = { setIO, getIO };
