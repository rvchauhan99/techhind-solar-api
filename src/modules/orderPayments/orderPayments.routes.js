const express = require("express");
const router = express.Router();
const controller = require("./orderPayments.controller");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermission } = require("../../common/middlewares/modulePermission.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

// All order payment audit routes are tied to module key `payment_audit`

// List payments (before /:id)
router.get(
  "/",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleKey: "payment_audit", action: "read" }),
  controller.listPayments
);

// Get receipt signed URL (before /:id)
router.get(
  "/:id/receipt-url",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleKey: "payment_audit", action: "read" }),
  controller.getReceiptUrl
);

// Approve / Reject payment (state-changing)
router.post(
  "/:id/approve",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleKey: "payment_audit", action: "update" }),
  controller.approvePayment
);
router.post(
  "/:id/reject",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleKey: "payment_audit", action: "update" }),
  controller.rejectPayment
);

// Printable receipt PDF
router.get(
  "/:id/receipt-pdf",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleKey: "payment_audit", action: "read" }),
  controller.generateReceiptPdf
);

// Create payment with file upload
router.post(
  "/",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleKey: "payment_audit", action: "create" }),
  uploadMemory.single("receipt_cheque_file"),
  controller.createPayment
);

// Get payment by ID
router.get(
  "/:id",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleKey: "payment_audit", action: "read" }),
  controller.getPaymentById
);

// Update payment with file upload
router.put(
  "/:id",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleKey: "payment_audit", action: "update" }),
  uploadMemory.single("receipt_cheque_file"),
  controller.updatePayment
);

// Delete payment
router.delete(
  "/:id",
  ...requireAuthWithTenant,
  requireModulePermission({ moduleKey: "payment_audit", action: "delete" }),
  controller.deletePayment
);

module.exports = router;
