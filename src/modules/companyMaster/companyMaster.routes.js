const { Router } = require("express");
const controller = require("./companyMaster.controller.js");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

const router = Router();

// Company Profile Routes
router.get("/profile", validateAccessToken, controller.getProfile);
router.put("/profile", validateAccessToken, controller.updateProfile);

// Bank Account Routes
router.get("/bank-accounts", validateAccessToken, controller.listBankAccounts);
router.post("/bank-accounts", validateAccessToken, controller.createBankAccount);
router.put("/bank-accounts/:id", validateAccessToken, controller.updateBankAccount);
router.delete("/bank-accounts/:id", validateAccessToken, controller.deleteBankAccount);

// Branch Routes
router.get("/branches", validateAccessToken, controller.listBranches);
router.get("/branches/default", validateAccessToken, controller.getDefaultBranch);
router.post("/branches", validateAccessToken, controller.createBranch);
router.put("/branches/:id", validateAccessToken, controller.updateBranch);
router.delete("/branches/:id", validateAccessToken, controller.deleteBranch);

// Warehouse Routes
router.get("/warehouses", validateAccessToken, controller.listWarehouses);
router.post("/warehouses", validateAccessToken, controller.createWarehouse);
router.put("/warehouses/:id", validateAccessToken, controller.updateWarehouse);
router.delete("/warehouses/:id", validateAccessToken, controller.deleteWarehouse);
router.get("/warehouses/:id/managers", validateAccessToken, controller.getWarehouseManagers);
router.put("/warehouses/:id/managers", validateAccessToken, controller.setWarehouseManagers);

// Image Routes
router.get("/images/:imageType/url", validateAccessToken, controller.getImageUrl);
router.post("/images/upload", validateAccessToken, uploadMemory.single("image"), controller.uploadImage);
router.post("/images/delete", validateAccessToken, controller.deleteImage);

module.exports = router;

