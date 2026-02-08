const { Router } = require('express');
const controller = require('./masters.controller.js');
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");

const router = Router();

const uploadMemory = require('../../common/middlewares/uploadMemory.js');

router.get('/master-list', ...requireAuthWithTenant, controller.masterList);
router.get('/list/:model', ...requireAuthWithTenant, controller.list);
router.get('/reference-options', ...requireAuthWithTenant, controller.getReferenceOptions);
router.get('/constants', ...requireAuthWithTenant, controller.getAppConstants);
router.get('/state/default', ...requireAuthWithTenant, controller.getDefaultState);
router.post('/create', ...requireAuthWithTenant, uploadMemory.single('file'), controller.create);
// CSV sample download and upload (must be before /:id routes)
router.get('/sample-file', ...requireAuthWithTenant, controller.downloadSample);
router.post('/upload', ...requireAuthWithTenant, uploadMemory.single('file'), controller.uploadData);
router.get('/:id/file-url', ...requireAuthWithTenant, controller.getFileUrl);
router.get('/:id', ...requireAuthWithTenant, controller.getById);
router.put('/:id', ...requireAuthWithTenant, uploadMemory.single('file'), controller.update);
router.delete('/:id', ...requireAuthWithTenant, controller.remove);

module.exports = router;
