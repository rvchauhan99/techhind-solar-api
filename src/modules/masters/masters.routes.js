const { Router } = require('express');
const controller = require('./masters.controller.js');
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const {
  requireModulePermission,
  requireOpenedModuleReadPermission,
} = require("../../common/middlewares/modulePermission.js");

const router = Router();

const uploadMemory = require('../../common/middlewares/uploadMemory.js');

const masters = (action) => requireModulePermission({ moduleRoute: "/masters", action });
const referenceRead = requireOpenedModuleReadPermission({ fallbackModuleRoute: "/masters" });

router.get('/master-list', ...requireAuthWithTenant, masters("read"), controller.masterList);
router.get('/list/:model', ...requireAuthWithTenant, masters("read"), controller.list);
router.get('/reference-options', ...requireAuthWithTenant, referenceRead, controller.getReferenceOptions);
router.get('/constants', ...requireAuthWithTenant, referenceRead, controller.getAppConstants);
router.get('/state/default', ...requireAuthWithTenant, referenceRead, controller.getDefaultState);
router.post('/create', ...requireAuthWithTenant, masters("create"), uploadMemory.single('file'), controller.create);
// CSV sample download and upload (must be before /:id routes)
router.get('/sample-file', ...requireAuthWithTenant, masters("read"), controller.downloadSample);
router.post('/upload', ...requireAuthWithTenant, masters("create"), uploadMemory.single('file'), controller.uploadData);
router.get('/:id/file-url', ...requireAuthWithTenant, masters("read"), controller.getFileUrl);
router.get('/:id', ...requireAuthWithTenant, masters("read"), controller.getById);
router.put('/:id', ...requireAuthWithTenant, masters("update"), uploadMemory.single('file'), controller.update);
router.delete('/:id', ...requireAuthWithTenant, masters("delete"), controller.remove);

module.exports = router;
