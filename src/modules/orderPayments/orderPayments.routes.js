const express = require("express");
const router = express.Router();
const controller = require("./orderPayments.controller");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

// List payments (before /:id)
router.get("/", validateAccessToken, controller.listPayments);

// Get receipt signed URL (before /:id)
router.get("/:id/receipt-url", validateAccessToken, controller.getReceiptUrl);

// Create payment with file upload
router.post("/", validateAccessToken, uploadMemory.single("receipt_cheque_file"), controller.createPayment);

// Get payment by ID
router.get("/:id", validateAccessToken, controller.getPaymentById);

// Update payment with file upload
router.put("/:id", validateAccessToken, uploadMemory.single("receipt_cheque_file"), controller.updatePayment);

// Delete payment
router.delete("/:id", validateAccessToken, controller.deletePayment);

module.exports = router;
