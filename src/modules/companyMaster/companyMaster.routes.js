const { Router } = require("express");
const controller = require("./companyMaster.controller.js");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const {
  requireModulePermission,
  requireModulePermissionAny,
  REFERENCE_COMPANY_CONSUMER_ROUTES,
} = require("../../common/middlewares/modulePermission.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

const router = Router();

const refRead = requireModulePermissionAny({ moduleRoutes: REFERENCE_COMPANY_CONSUMER_ROUTES, action: "read" });
const company = (action) => requireModulePermission({ moduleRoute: "/company", action });

// Company Profile: reference read for GET (forms/dropdowns), own module for update
router.get("/profile", ...requireAuthWithTenant, refRead, controller.getProfile);
router.put("/profile", ...requireAuthWithTenant, company("update"), controller.updateProfile);

// Bank Accounts: reference read for list, own module for create/update/delete
router.get("/bank-accounts", ...requireAuthWithTenant, refRead, controller.listBankAccounts);
router.post("/bank-accounts", ...requireAuthWithTenant, company("create"), controller.createBankAccount);
router.put("/bank-accounts/:id", ...requireAuthWithTenant, company("update"), controller.updateBankAccount);
router.delete("/bank-accounts/:id", ...requireAuthWithTenant, company("delete"), controller.deleteBankAccount);

// Branches: reference read for list and default, own module for create/update/delete
router.get("/branches", ...requireAuthWithTenant, refRead, controller.listBranches);
router.get("/branches/default", ...requireAuthWithTenant, refRead, controller.getDefaultBranch);
router.post("/branches", ...requireAuthWithTenant, company("create"), controller.createBranch);
router.put("/branches/:id", ...requireAuthWithTenant, company("update"), controller.updateBranch);
router.delete("/branches/:id", ...requireAuthWithTenant, company("delete"), controller.deleteBranch);

// Warehouses: reference read for list and managers, own module for create/update/delete
router.get("/warehouses", ...requireAuthWithTenant, refRead, controller.listWarehouses);
router.get("/warehouses/:id/managers", ...requireAuthWithTenant, refRead, controller.getWarehouseManagers);
router.post("/warehouses", ...requireAuthWithTenant, company("create"), controller.createWarehouse);
router.put("/warehouses/:id", ...requireAuthWithTenant, company("update"), controller.updateWarehouse);
router.delete("/warehouses/:id", ...requireAuthWithTenant, company("delete"), controller.deleteWarehouse);
router.put("/warehouses/:id/managers", ...requireAuthWithTenant, company("update"), controller.setWarehouseManagers);

// Images: reference read for URL (display), own module for upload/delete
router.get("/images/:imageType/url", ...requireAuthWithTenant, refRead, controller.getImageUrl);
router.post("/images/upload", ...requireAuthWithTenant, uploadMemory.single("image"), company("update"), controller.uploadImage);
router.post("/images/delete", ...requireAuthWithTenant, company("update"), controller.deleteImage);

module.exports = router;

