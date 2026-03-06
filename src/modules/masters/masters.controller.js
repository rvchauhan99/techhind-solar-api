const { asyncHandler } = require('../../common/utils/asyncHandler.js');
const responseHandler = require('../../common/utils/responseHandler.js');
const AppError = require('../../common/errors/AppError.js');
const masterService = require('./masters.service.js');
const bucketService = require('../../common/services/bucket.service.js');

const FILE_UNAVAILABLE_MESSAGE =
  'We couldn\'t save your documents right now. Please try again in a few minutes.';

const masterList = asyncHandler(async (req, res) => {
  const result = require('../../common/utils/masters.json');
  result.sort((a, b) => a.name.localeCompare(b.name));
  return responseHandler.sendSuccess(res, result, 'Masters fetched', 200);
});

const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  const { model } = req.query;
  if (!model) {
    return responseHandler.sendError(res, 'Model parameter is required', 400);
  }

  if (req.file) {
    const mastersConfig = require('../../common/utils/masters.json');
    const masterConfig = mastersConfig.find(m => m.model_name === model) || {};
    const fileUploadFields = masterConfig.file_upload_fields || [];
    const fieldName = fileUploadFields.length > 0 ? fileUploadFields[0] : 'file_path';
    const bucketClient = bucketService.getBucketForRequest(req);
    try {
      const result = await bucketService.uploadFile(req.file, {
        prefix: `masters/${model}`,
        acl: 'private',
      }, bucketClient);
      payload[fieldName] = result.path;
    } catch (error) {
      console.error('Error uploading file to bucket:', error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  const created = await masterService.createMaster({
    model,
    payload,
    userId: req.user?.id,
  }, req);
  return responseHandler.sendSuccess(res, created, 'Record created', 201);
});

const list = asyncHandler(async (req, res) => {
  const { model } = req.params;
  const query = { ...req.query };
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 20;
  const visibilityVal = ['active', 'inactive', 'all'].includes(query.visibility) ? query.visibility : 'active';
  const result = await masterService.getMasterList({
    model,
    page,
    limit,
    q: query.q || null,
    status: query.status || null,
    visibility: visibilityVal,
    filters: query,
  }, req);
  return responseHandler.sendSuccess(res, result, 'Master list fetched', 200);
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { model } = req.query;
  if (!model) {
    return responseHandler.sendError(res, 'Model parameter is required', 400);
  }
  const item = await masterService.getMasterById({ model, id }, req);
  return responseHandler.sendSuccess(res, item, 'Record fetched', 200);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };
  const { model } = req.query;
  if (!model) {
    return responseHandler.sendError(res, 'Model parameter is required', 400);
  }
  
  if (req.file) {
    const mastersConfig = require('../../common/utils/masters.json');
    const masterConfig = mastersConfig.find(m => m.model_name === model) || {};
    const fileUploadFields = masterConfig.file_upload_fields || [];
    const fieldName = fileUploadFields.length > 0 ? fileUploadFields[0] : 'file_path';
    const bucketClient = bucketService.getBucketForRequest(req);
    const existing = await masterService.getMasterById({ model, id }, req);
    if (existing && existing[fieldName] && !existing[fieldName].startsWith('/')) {
      try {
        await bucketService.deleteFileWithClient(bucketClient, existing[fieldName]);
      } catch (err) {
        console.error('Error deleting old file from bucket:', err);
      }
    }
    try {
      const result = await bucketService.uploadFile(req.file, {
        prefix: `masters/${model}`,
        acl: 'private',
      }, bucketClient);
      updates[fieldName] = result.path;
    } catch (error) {
      console.error('Error uploading file to bucket:', error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  const updated = await masterService.updateMaster({
    model,
    id,
    updates,
    userId: req.user?.id,
  }, req);
  return responseHandler.sendSuccess(res, updated, 'Record updated', 200);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { model } = req.query;
  const recordId = parseInt(id, 10);

  if (isNaN(recordId)) {
    return responseHandler.sendError(res, 'Invalid record ID', 400);
  }

  if (!model) {
    return responseHandler.sendError(res, 'Model parameter is required', 400);
  }

  const mastersConfig = require('../../common/utils/masters.json');
  const masterConfig = mastersConfig.find(m => m.model_name === model) || {};
  const fileUploadFields = masterConfig.file_upload_fields || [];
  const fieldName = fileUploadFields.length > 0 ? fileUploadFields[0] : 'file_path';
  const bucketClient = bucketService.getBucketForRequest(req);
  const existing = await masterService.getMasterById({ model, id: recordId }, req);
  if (existing && existing[fieldName] && !existing[fieldName].startsWith('/')) {
    try {
      await bucketService.deleteFileWithClient(bucketClient, existing[fieldName]);
    } catch (error) {
      console.error('Error deleting file from bucket:', error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  await masterService.deleteMaster({ model, id: recordId }, req);
  return responseHandler.sendSuccess(res, null, 'Record deleted', 200);
});

const getReferenceOptions = asyncHandler(async (req, res) => {
  const { model, status, status_in, q, limit, id } = req.query;
  if (!model) {
    return responseHandler.sendError(res, 'Model parameter is required', 400);
  }
  const options = await masterService.getReferenceOptions({
    model,
    status: status || undefined,
    status_in: status_in || undefined,
    q: q || undefined,
    limit: limit != null && limit !== '' ? limit : undefined,
    id: id || undefined,
  }, req);
  return responseHandler.sendSuccess(res, options, 'Reference options fetched', 200);
});

const getAppConstants = asyncHandler(async (req, res) => {
  const { INQUIRY_RATINGS, PAYMENT_TYPES } = require('../../common/utils/constants.js');
  return responseHandler.sendSuccess(
    res,
    { ratings: INQUIRY_RATINGS, paymentTypes: PAYMENT_TYPES },
    'Constants fetched',
    200
  );
});

const getDefaultState = asyncHandler(async (req, res) => {
  const defaultState = await masterService.getDefaultState(req);
  return responseHandler.sendSuccess(res, defaultState, 'Default state fetched', 200);
});

const getDefaultBranch = asyncHandler(async (req, res) => {
  const defaultBranch = await masterService.getDefaultBranch(req);
  return responseHandler.sendSuccess(res, defaultBranch, 'Default branch fetched', 200);
});

const downloadSample = asyncHandler(async (req, res) => {
  const { model } = req.query;
  if (!model) {
    return responseHandler.sendError(res, 'Model parameter is required', 400);
  }
  const { filename, csv } = await masterService.generateSampleCsv({ model }, req);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

const uploadData = asyncHandler(async (req, res) => {
  const { model } = req.query;
  if (!model) {
    return responseHandler.sendError(res, 'Model parameter is required', 400);
  }
  if (!req.file) {
    return responseHandler.sendError(res, 'CSV file is required', 400);
  }
  
  // Validate filename matches model name
  const filename = req.file.originalname || req.file.filename || '';
  const expectedModelName = model.replace(/\.model$/i, '').toLowerCase();
  
  if (filename) {
    // Normalize filename for comparison (remove extension, sample suffix, special chars)
    const normalizedFilename = filename.toLowerCase()
      .replace(/\.csv$/i, '')
      .replace(/-sample$/i, '')
      .replace(/[^a-z0-9]/g, '');
    
    const normalizedModelName = expectedModelName.replace(/[^a-z0-9]/g, '');
    
    // Check if filename contains model name (case-insensitive, allows extra characters)
    // Example: "bank-sample.csv" or "bank-data.csv" should match "bank"
    if (normalizedFilename && normalizedModelName) {
      const filenameContainsModel = normalizedFilename.includes(normalizedModelName) || 
                                     normalizedModelName.includes(normalizedFilename.substring(0, normalizedModelName.length));
      
      // If filename doesn't contain model name at all, it's likely wrong
      if (!filenameContainsModel && normalizedFilename.length > 3) {
        return responseHandler.sendError(
          res, 
          `File mismatch: The uploaded file "${filename}" does not appear to be for "${expectedModelName}". ` +
          `Please upload a CSV file that matches the ${expectedModelName} master (e.g., ${expectedModelName}-sample.csv).`, 
          400
        );
      }
    }
  }
  
  const csvText = req.file.buffer ? req.file.buffer.toString('utf-8') : '';
  try {
    const result = await masterService.bulkUploadFromCsv({ model, csvText, filename }, req);

    // Return result CSV file with summary
    if (result.resultCsv) {
      const resultFilename = `${expectedModelName}-upload-result-${Date.now()}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${resultFilename}"`);
      res.setHeader('X-Upload-Summary', JSON.stringify({
        inserted: result.inserted,
        failed: result.failed,
        total: result.total
      }));
      return res.status(200).send(result.resultCsv);
    }
    
    // Fallback to JSON response if CSV generation failed
    return responseHandler.sendSuccess(res, result, 'Upload processed', 200);
  } catch (err) {
    throw err;
  }
});

const getFileUrl = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { model } = req.query;
  if (!model) {
    return responseHandler.sendError(res, 'Model parameter is required', 400);
  }
  const item = await masterService.getMasterById({ model, id }, req);
  if (!item) {
    return responseHandler.sendError(res, 'Record not found', 404);
  }
  const mastersConfig = require('../../common/utils/masters.json');
  const masterConfig = mastersConfig.find(m => m.model_name === model) || {};
  const fileUploadFields = masterConfig.file_upload_fields || [];
  const fieldName = fileUploadFields.length > 0 ? fileUploadFields[0] : 'file_path';
  const pathOrKey = item[fieldName];
  if (!pathOrKey) {
    return responseHandler.sendError(res, 'File not found', 404);
  }
  if (pathOrKey.startsWith('/')) {
    return responseHandler.sendError(res, 'Legacy file; use static URL', 400);
  }
  try {
    const bucketClient = bucketService.getBucketForRequest(req);
    const url = await bucketService.getSignedUrl(pathOrKey, 3600, bucketClient);
    return responseHandler.sendSuccess(
      res,
      { url, expires_in: 3600 },
      'Signed URL generated',
      200
    );
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return responseHandler.sendError(res, FILE_UNAVAILABLE_MESSAGE, 503);
  }
});

const removeFile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { model, field } = req.query;
  const recordId = parseInt(id, 10);

  if (isNaN(recordId)) {
    return responseHandler.sendError(res, 'Invalid record ID', 400);
  }
  if (!model) {
    return responseHandler.sendError(res, 'Model parameter is required', 400);
  }

  const mastersConfig = require('../../common/utils/masters.json');
  const masterConfig = mastersConfig.find(m => m.model_name === model) || {};
  const fileUploadFields = masterConfig.file_upload_fields || [];

  if (!fileUploadFields.length) {
    return responseHandler.sendError(res, 'No file upload fields configured for this master', 400);
  }

  const fieldName = field && fileUploadFields.includes(field) ? field : fileUploadFields[0];
  const existing = await masterService.getMasterById({ model, id: recordId }, req);

  const pathOrKey = existing?.[fieldName];
  if (!pathOrKey) {
    // Idempotent: nothing to remove
    return responseHandler.sendSuccess(res, existing, 'No file to remove', 200);
  }

  if (!String(pathOrKey).startsWith('/')) {
    try {
      const bucketClient = bucketService.getBucketForRequest(req);
      await bucketService.deleteFileWithClient(bucketClient, pathOrKey);
    } catch (error) {
      console.error('Error deleting file from bucket:', error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  const updated = await masterService.updateMaster({
    model,
    id: recordId,
    updates: { [fieldName]: null },
    userId: req.user?.id,
  }, req);

  return responseHandler.sendSuccess(res, updated, 'File removed', 200);
});

module.exports = { masterList, create, list, getById, update, remove, getReferenceOptions, getAppConstants, downloadSample, uploadData, getDefaultState, getDefaultBranch, getFileUrl, removeFile };
