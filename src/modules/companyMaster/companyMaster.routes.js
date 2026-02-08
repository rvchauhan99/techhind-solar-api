const { Router } = require("express");
const controller = require("./companyMaster.controller.js");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

const router = Router();

// Company Profile Routes
router.get("/profile", ...requireAuthWithTenant, controller.getProfile);
router.put("/profile", ...requireAuthWithTenant, controller.updateProfile);

// Bank Account Routes
router.get("/bank-accounts", ...requireAuthWithTenant, controller.listBankAccounts);
router.post("/bank-accounts", ...requireAuthWithTenant, controller.createBankAccount);
router.put("/bank-accounts/:id", ...requireAuthWithTenant, controller.updateBankAccount);
router.delete("/bank-accounts/:id", ...requireAuthWithTenant, controller.deleteBankAccount);

// Branch Routes
router.get("/branches", ...requireAuthWithTenant, controller.listBranches);
router.get("/branches/default", ...requireAuthWithTenant, controller.getDefaultBranch);
router.post("/branches", ...requireAuthWithTenant, controller.createBranch);
router.put("/branches/:id", ...requireAuthWithTenant, controller.updateBranch);
router.delete("/branches/:id", ...requireAuthWithTenant, controller.deleteBranch);

// Warehouse Routes
router.get("/warehouses", ...requireAuthWithTenant, controller.listWarehouses);
router.post("/warehouses", ...requireAuthWithTenant, controller.createWarehouse);
router.put("/warehouses/:id", ...requireAuthWithTenant, controller.updateWarehouse);
router.delete("/warehouses/:id", ...requireAuthWithTenant, controller.deleteWarehouse);
router.get("/warehouses/:id/managers", ...requireAuthWithTenant, controller.getWarehouseManagers);
router.put("/warehouses/:id/managers", ...requireAuthWithTenant, controller.setWarehouseManagers);

// Image Routes
router.get("/images/:imageType/url", ...requireAuthWithTenant, controller.getImageUrl);
router.post("/images/upload", ...requireAuthWithTenant, uploadMemory.single("image"), controller.uploadImage);
router.post("/images/delete", ...requireAuthWithTenant, controller.deleteImage);

module.exports = router;

