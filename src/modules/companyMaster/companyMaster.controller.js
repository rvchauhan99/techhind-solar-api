const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const AppError = require("../../common/errors/AppError.js");
const companyService = require("./companyMaster.service.js");
const bucketService = require("../../common/services/bucket.service.js");

const FILE_UNAVAILABLE_MESSAGE =
  "We couldn't save your documents right now. Please try again in a few minutes.";

const getProfile = asyncHandler(async (req, res) => {
  const company = await companyService.getCompanyProfile(req.transaction);
  return responseHandler.sendSuccess(res, company, "Company profile fetched", 200);
});

const updateProfile = asyncHandler(async (req, res) => {
  const payload = req.body;
  const updated = await companyService.updateCompanyProfile(payload, req.transaction);
  return responseHandler.sendSuccess(res, updated, "Company profile updated", 200);
});

const createBankAccount = asyncHandler(async (req, res) => {
  const payload = req.body;
  const created = await companyService.createBankAccount(payload, req.transaction);
  return responseHandler.sendSuccess(res, created, "Bank account created", 201);
});

const updateBankAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await companyService.updateBankAccount(id, payload, req.transaction);
  return responseHandler.sendSuccess(res, updated, "Bank account updated", 200);
});

const deleteBankAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await companyService.deleteBankAccount(id, req.transaction);
  return responseHandler.sendSuccess(res, null, "Bank account deactivated", 200);
});

const listBankAccounts = asyncHandler(async (req, res) => {
  const bankAccounts = await companyService.listBankAccounts(req.transaction);
  return responseHandler.sendSuccess(res, bankAccounts, "Bank accounts fetched", 200);
});

// Branch Controllers
const createBranch = asyncHandler(async (req, res) => {
  const payload = req.body;
  const created = await companyService.createBranch(payload, req.transaction);
  return responseHandler.sendSuccess(res, created, "Branch created", 201);
});

const updateBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await companyService.updateBranch(id, payload, req.transaction);
  return responseHandler.sendSuccess(res, updated, "Branch updated", 200);
});

const deleteBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await companyService.deleteBranch(id, req.transaction);
  return responseHandler.sendSuccess(res, null, "Branch deactivated", 200);
});

const listBranches = asyncHandler(async (req, res) => {
  const branches = await companyService.listBranches(req.transaction);
  return responseHandler.sendSuccess(res, branches, "Branches fetched", 200);
});

const getDefaultBranch = asyncHandler(async (req, res) => {
  const defaultBranch = await companyService.getDefaultBranch(req.transaction);
  return responseHandler.sendSuccess(res, defaultBranch, "Default branch fetched", 200);
});

// Warehouse Controllers
const createWarehouse = asyncHandler(async (req, res) => {
  const payload = req.body;
  const created = await companyService.createWarehouse(payload, req.transaction);
  return responseHandler.sendSuccess(res, created, "Warehouse created", 201);
});

const updateWarehouse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await companyService.updateWarehouse(id, payload, req.transaction);
  return responseHandler.sendSuccess(res, updated, "Warehouse updated", 200);
});

const deleteWarehouse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await companyService.deleteWarehouse(id, req.transaction);
  return responseHandler.sendSuccess(res, null, "Warehouse deactivated", 200);
});

const listWarehouses = asyncHandler(async (req, res) => {
  const { company_id } = req.query;
  const companyId = company_id ? parseInt(company_id) : null;
  const warehouses = await companyService.listWarehouses(companyId, req.transaction);
  return responseHandler.sendSuccess(res, warehouses, "Warehouses fetched", 200);
});

const getWarehouseManagers = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const managers = await companyService.getWarehouseManagers(id, req.transaction);
  return responseHandler.sendSuccess(res, managers, "Warehouse managers fetched", 200);
});

const setWarehouseManagers = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { user_ids: userIds } = req.body;
  await companyService.setWarehouseManagers(id, userIds || [], req.transaction);
  return responseHandler.sendSuccess(res, null, "Warehouse managers updated", 200);
});

// Image Controllers
const uploadImage = asyncHandler(async (req, res) => {
  const { imageType } = req.body;
  if (!imageType) {
    return responseHandler.sendError(res, "Image type is required", 400);
  }

  if (!req.file) {
    return responseHandler.sendError(res, "Image file is required", 400);
  }

  let bucketKey;
  try {
    const uploadResult = await bucketService.uploadFile(req.file, {
      prefix: `company-images/${imageType}`,
      acl: "private",
    });
    bucketKey = uploadResult.path;
  } catch (error) {
    console.error("Error uploading image to bucket:", error);
    throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
  }

  const result = await companyService.uploadCompanyImage(imageType, bucketKey, req.transaction);

  // Delete old file from bucket if it was a bucket key
  if (result.oldImagePath && !result.oldImagePath.startsWith("/")) {
    try {
      await bucketService.deleteFile(result.oldImagePath);
    } catch (err) {
      console.error("Error deleting old image from bucket:", err);
    }
  }

  return responseHandler.sendSuccess(res, result, "Image uploaded successfully", 200);
});

const deleteImage = asyncHandler(async (req, res) => {
  const { imageType } = req.body;
  if (!imageType) {
    return responseHandler.sendError(res, "Image type is required", 400);
  }

  const result = await companyService.deleteCompanyImage(imageType, req.transaction);
  const deletedImagePath = result.deletedImagePath;

  if (deletedImagePath && !deletedImagePath.startsWith("/")) {
    try {
      await bucketService.deleteFile(deletedImagePath);
    } catch (error) {
      console.error("Error deleting image from bucket:", error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  return responseHandler.sendSuccess(res, result, "Image deleted successfully", 200);
});

const getImageUrl = asyncHandler(async (req, res) => {
  const { imageType } = req.params;
  const company = await companyService.getCompanyProfile(req.transaction);
  if (!company) {
    return responseHandler.sendError(res, "Company not found", 404);
  }
  const path = company[imageType];
  if (!path) {
    return responseHandler.sendError(res, "Image not found", 404);
  }
  if (path.startsWith("/")) {
    return responseHandler.sendError(res, "Legacy image; use static URL", 400);
  }
  try {
    const url = await bucketService.getSignedUrl(path, 3600);
    return responseHandler.sendSuccess(
      res,
      { url, expires_in: 3600 },
      "Signed URL generated",
      200
    );
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return responseHandler.sendError(res, FILE_UNAVAILABLE_MESSAGE, 503);
  }
});

module.exports = {
  getProfile,
  updateProfile,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  listBankAccounts,
  createBranch,
  updateBranch,
  deleteBranch,
  listBranches,
  getDefaultBranch,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  listWarehouses,
  getWarehouseManagers,
  setWarehouseManagers,
  uploadImage,
  deleteImage,
  getImageUrl,
};

