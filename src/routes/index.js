const { Router } = require("express");
const db = require("../models/index.js");
const { requireAuthWithTenant } = require("../common/middlewares/auth.js");
const { requireModulePermissionByMethod, requireModulePermissionAnyByMethod } = require("../common/middlewares/modulePermission.js");
const authRoutes = require("../modules/auth/auth.routes.js");
const moduleMasterRoutes = require("../modules/moduleMaster/moduleMaster.routes.js");
const roleMasterRoutes = require("../modules/roleMaster/roleMaster.routes.js");
const roleModuleRoutes = require('../modules/roleModule/roleModule.routes.js');
const roleModulePermissionRoutes = require("../modules/roleModule/roleModule.permission.routes.js");
const userMasterRoutes = require('../modules/userMaster/userMaster.routes.js');
const mastersRoutes = require('../modules/masters/masters.routes.js');
const companyMasterRoutes = require('../modules/companyMaster/companyMaster.routes.js');
const siteVisitRoutes = require('../modules/siteVisit/siteVisit.routes.js');
const siteSurveyRoutes = require('../modules/siteSurvey/siteSurvey.routes.js');
const inquiryRoutes = require('../modules/inquiry/inquiry.routes.js');
const followupRoutes = require('../modules/followup/followup.routes.js');
const inquiryDocumentsRoutes = require('../modules/inquiryDocuments/inquiryDocuments.routes.js');
const orderDocumentsRoutes = require('../modules/orderDocuments/orderDocuments.routes.js');
const orderPaymentsRoutes = require('../modules/orderPayments/orderPayments.routes.js');
const productRoutes = require('../modules/product/product.routes.js');
const billOfMaterialRoutes = require('../modules/billOfMaterial/billOfMaterial.routes.js');
const projectPriceRoutes = require('../modules/project-price/projectPrice.routes.js');
const quotationRoutes = require('../modules/quotation/quotation.routes.js');
const orderRoutes = require('../modules/order/order.routes.js');
const homeRoutes = require('../modules/home/home.routes.js');
const supplierRoutes = require('../modules/supplier/supplier.routes.js');
const purchaseOrderRoutes = require('../modules/purchaseOrder/purchaseOrder.routes.js');
const poInwardRoutes = require('../modules/poInward/poInward.routes.js');
const stockRoutes = require('../modules/stock/stock.routes.js');
const inventoryLedgerRoutes = require('../modules/inventoryLedger/inventoryLedger.routes.js');
const stockTransferRoutes = require('../modules/stockTransfer/stockTransfer.routes.js');
const stockAdjustmentRoutes = require('../modules/stockAdjustment/stockAdjustment.routes.js');
const confirmOrdersRoutes = require('../modules/confirmOrders/confirmOrders.routes.js');
const closedOrdersRoutes = require('../modules/closedOrders/closedOrders.routes.js');
const marketingLeadRoutes = require('../modules/marketingLead/marketingLead.routes.js');
const challanRoutes = require('../modules/challan/challan.routes.js');
const b2bClientsRoutes = require('../modules/b2bClients/b2bClients.routes.js');
const b2bSalesQuotesRoutes = require('../modules/b2bSalesQuotes/b2bSalesQuotes.routes.js');
const b2bSalesOrdersRoutes = require('../modules/b2bSalesOrders/b2bSalesOrders.routes.js');
const b2bShipmentsRoutes = require('../modules/b2bShipments/b2bShipments.routes.js');
const b2bInvoicesRoutes = require('../modules/b2bInvoices/b2bInvoices.routes.js');
const serializedInventoryReportRoutes = require('../modules/reports/serializedInventory/serializedInventory.routes.js');
const deliveryReportRoutes = require('../modules/reports/deliveryReport/deliveryReport.routes.js');
const paymentsReportRoutes = require('../modules/reports/payments/paymentsReport.routes.js');
const billingRoutes = require('../modules/billing/billing.routes.js');
const adminRoutes = require('../modules/admin/admin.routes.js');
const router = Router();

// health check API – verifies main DB connectivity (works for both single-tenant and multi-tenant)
router.get("/health-check", async (req, res) => {
  try {
    await db.sequelize.authenticate();
    res.status(200).json({ status: "ok", database: "connected", message: "Solar API is working" });
  } catch (err) {
    res.status(503).json({ status: "error", database: "disconnected", message: err?.message || "Database unavailable" });
  }
});

router.use("/auth", authRoutes);

// Runtime permission helper endpoint is auth-only.
router.use("/role-module", roleModulePermissionRoutes);

// Mounts protected by module permission; resolve by modules.route (path-only, no query params).
router.use("/module-master", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/module-master" }), moduleMasterRoutes);
router.use("/role-master", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/role-master" }), roleMasterRoutes);
router.use("/role-module", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/role-module" }), roleModuleRoutes);
router.use("/user-master", requireAuthWithTenant, userMasterRoutes);
router.use("/masters", requireAuthWithTenant, mastersRoutes);
router.use("/company", requireAuthWithTenant, companyMasterRoutes);
router.use("/site-visit", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/site-visit" }), siteVisitRoutes);
router.use("/site-survey", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/site-survey" }), siteSurveyRoutes);
router.use("/followup", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/followup" }), followupRoutes);
router.use("/inquiry-documents", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/inquiry" }), inquiryDocumentsRoutes);
router.use("/order-documents", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/order" }), orderDocumentsRoutes);
router.use("/product", requireAuthWithTenant, productRoutes);
router.use("/bill-of-material", requireAuthWithTenant, billOfMaterialRoutes);
router.use("/project-price", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/project-price" }), projectPriceRoutes);
router.use("/quotation", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/quotation" }), quotationRoutes);
router.use("/supplier", requireAuthWithTenant, supplierRoutes);
router.use("/purchase-orders", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/purchase-orders" }), purchaseOrderRoutes);
router.use("/po-inwards", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/po-inwards" }), poInwardRoutes);
router.use("/stocks", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/stocks" }), stockRoutes);
router.use("/inventory-ledger", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/inventory-ledger" }), inventoryLedgerRoutes);
router.use("/stock-transfers", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/stock-transfers" }), stockTransferRoutes);
router.use("/stock-adjustments", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/stock-adjustments" }), stockAdjustmentRoutes);
router.use("/reports/serialized-inventory", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/reports/serialized-inventory" }), serializedInventoryReportRoutes);
router.use("/reports/deliveries", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/reports/deliveries" }), deliveryReportRoutes);
router.use("/billing", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/billing" }), billingRoutes);
router.use("/admin", adminRoutes);

// Child API mounts use parent page module: order-documents/inquiry-documents use /order and /inquiry above; order-payments uses any of order-related pages.
// Mounts that use per-route requireModulePermission (no mount-level module check).
router.use("/inquiry", inquiryRoutes);
router.use("/order", orderRoutes);
router.use("/home", homeRoutes);
router.use("/confirm-orders", confirmOrdersRoutes);
router.use("/closed-orders", closedOrdersRoutes);
router.use("/marketing-leads", marketingLeadRoutes);
router.use("/challan", requireAuthWithTenant, requireModulePermissionAnyByMethod({ moduleRoutes: ["/order", "/confirm-orders", "/closed-orders"] }), challanRoutes);
router.use("/order-payments", requireAuthWithTenant, requireModulePermissionAnyByMethod({ moduleRoutes: ["/order", "/confirm-orders", "/closed-orders"] }), orderPaymentsRoutes);

router.use("/b2b-clients", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/b2b-clients" }), b2bClientsRoutes);
router.use("/b2b-sales-quotes", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/b2b-sales-quotes" }), b2bSalesQuotesRoutes);
router.use("/b2b-sales-orders", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/b2b-sales-orders" }), b2bSalesOrdersRoutes);
router.use("/b2b-shipments", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/b2b-shipments" }), b2bShipmentsRoutes);
router.use("/b2b-invoices", requireAuthWithTenant, requireModulePermissionByMethod({ moduleRoute: "/b2b-invoices" }), b2bInvoicesRoutes);
router.use("/reports/payments", paymentsReportRoutes);

router.get("/", (req, res) => res.send("API Running ✅"));

module.exports = router;
