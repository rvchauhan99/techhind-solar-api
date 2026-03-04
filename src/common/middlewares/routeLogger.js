// src/middlewares/logger.js
const routeLogger = (req, res, next) => {
  const startedAt = Date.now();

  // Log once on response finish so tenant context can be included if resolved later.
  res.on("finish", () => {
    const tenantPrefix = req.tenantIdForLog ? `[tenant_id=${req.tenantIdForLog}] ` : "";
    const durationMs = Date.now() - startedAt;
    console.log(
      "API Call : ",
      `[${new Date().toISOString()}] ${tenantPrefix}${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`
    );
  });

  next();
};

module.exports = routeLogger;
