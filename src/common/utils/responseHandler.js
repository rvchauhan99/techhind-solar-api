// common/utils/responseHandler.js

/**
 * Success response
 * @param {Object} res - Express response object
 * @param {Object} data - Payload
 * @param {string} message - Optional message
 * @param {number} statusCode - HTTP status code (default 200)
 */
const sendSuccess = (
  res,
  data = null,
  message = "Success",
  statusCode = 200
) => {
  return res.status(statusCode).json({
    status: true,
    message,
    result: data,
  });
};

/**
 * Error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default 500)
 * @param {Object} error - Optional error object for debugging
 */
const sendError = (
  res,
  message = "Internal Server Error",
  statusCode = 500,
  error = null
) => {
  const isDevelopment = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  
  return res.status(statusCode).json({
    status: false,
    message,
    result: null,
    ...(isDevelopment && error ? { error } : {}), // Only include error details in development
  });
};

module.exports = {
  sendSuccess,
  sendError,
};
