// src/middlewares/logger.js
const routeLogger = (req, res, next) => {
  console.log(
    "API Call : ",
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
  );
  next();
};

module.exports = routeLogger;
