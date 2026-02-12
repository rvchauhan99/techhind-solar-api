const errorHandler = async (err, req, res, next) => {
  console.log(err);
  if (req.transaction && !req.transaction.finished) {
    try {
      await req.transaction.rollback();
      console.log("🔁 Transaction rolled back");
    } catch (rollbackError) {
      console.error("⚠️ Transaction rollback failed:", rollbackError);
    }
  }

  // Use err.statusCode (from AppError) for explicit 4xx; otherwise 500 for server errors.
  // Do NOT use res.statusCode - it defaults to 200 and would send errors as HTTP 200,
  // causing the frontend to treat failures as success (axios resolves on 2xx).
  const statusCode = (err.statusCode >= 400 && err.statusCode < 600)
    ? err.statusCode
    : 500;
  
  res.status(statusCode).json({
    status: false,
    message: err.message || "Internal Server Error",
    result: null,
  });
};

module.exports = { errorHandler };
