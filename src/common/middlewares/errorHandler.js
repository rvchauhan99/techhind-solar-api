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

  // Use err.statusCode (from AppError) or default to 500
  const statusCode = err.statusCode || res.statusCode || 500;
  
  res.status(statusCode).json({
    status: false,
    message: err.message || "Internal Server Error",
    result: null,
  });
};

module.exports = { errorHandler };
