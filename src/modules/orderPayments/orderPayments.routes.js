const express = require("express");
const router = express.Router();
const controller = require("./orderPayments.controller");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

// List payments (before /:id)
router.get("/", ...requireAuthWithTenant, controller.listPayments);

// Get receipt signed URL (before /:id)
router.get("/:id/receipt-url", ...requireAuthWithTenant, controller.getReceiptUrl);

// Approve / Reject payment
router.post("/:id/approve", ...requireAuthWithTenant, controller.approvePayment);
router.post("/:id/reject", ...requireAuthWithTenant, controller.rejectPayment);

// Printable receipt PDF
router.get("/:id/receipt-pdf", ...requireAuthWithTenant, controller.generateReceiptPdf);

// Create payment with file upload
router.post("/", ...requireAuthWithTenant, uploadMemory.single("receipt_cheque_file"), controller.createPayment);

// Get payment by ID
router.get("/:id", ...requireAuthWithTenant, controller.getPaymentById);

// Update payment with file upload
router.put("/:id", ...requireAuthWithTenant, uploadMemory.single("receipt_cheque_file"), controller.updatePayment);

// Delete payment
router.delete("/:id", ...requireAuthWithTenant, controller.deletePayment);

module.exports = router;
