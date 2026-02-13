const express = require("express");
const router = express.Router();
const controller = require("./orderPayments.controller");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const { requireModulePermissionAny } = require("../../common/middlewares/modulePermission.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

// Order payments: allow if user has the action on any of these modules (payment_audit or order-related)
const ORDER_PAYMENT_MODULES = ["payment_audit", "confirm_orders", "closed_orders", "pending_orders", "fabrication_installation"];

// List payments (before /:id)
router.get(
  "/",
  ...requireAuthWithTenant,
  requireModulePermissionAny({ moduleKeys: ORDER_PAYMENT_MODULES, action: "read" }),
  controller.listPayments
);

// Get receipt signed URL (before /:id)
router.get(
  "/:id/receipt-url",
  ...requireAuthWithTenant,
  requireModulePermissionAny({ moduleKeys: ORDER_PAYMENT_MODULES, action: "read" }),
  controller.getReceiptUrl
);

// Approve / Reject payment (state-changing)
router.post(
  "/:id/approve",
  ...requireAuthWithTenant,
  requireModulePermissionAny({ moduleKeys: ORDER_PAYMENT_MODULES, action: "update" }),
  controller.approvePayment
);
router.post(
  "/:id/reject",
  ...requireAuthWithTenant,
  requireModulePermissionAny({ moduleKeys: ORDER_PAYMENT_MODULES, action: "update" }),
  controller.rejectPayment
);

// Printable receipt PDF
router.get(
  "/:id/receipt-pdf",
  ...requireAuthWithTenant,
  requireModulePermissionAny({ moduleKeys: ORDER_PAYMENT_MODULES, action: "read" }),
  controller.generateReceiptPdf
);

// Create payment with file upload
router.post(
  "/",
  ...requireAuthWithTenant,
  requireModulePermissionAny({ moduleKeys: ORDER_PAYMENT_MODULES, action: "create" }),
  uploadMemory.single("receipt_cheque_file"),
  controller.createPayment
);

// Get payment by ID
router.get(
  "/:id",
  ...requireAuthWithTenant,
  requireModulePermissionAny({ moduleKeys: ORDER_PAYMENT_MODULES, action: "read" }),
  controller.getPaymentById
);

// Update payment with file upload
router.put(
  "/:id",
  ...requireAuthWithTenant,
  requireModulePermissionAny({ moduleKeys: ORDER_PAYMENT_MODULES, action: "update" }),
  uploadMemory.single("receipt_cheque_file"),
  controller.updatePayment
);

// Delete payment
router.delete(
  "/:id",
  ...requireAuthWithTenant,
  requireModulePermissionAny({ moduleKeys: ORDER_PAYMENT_MODULES, action: "delete" }),
  controller.deletePayment
);

module.exports = router;
