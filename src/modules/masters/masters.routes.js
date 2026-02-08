const { Router } = require('express');
const controller = require('./masters.controller.js');
const { validateAccessToken } = require("../../common/middlewares/auth.js");

const router = Router();

const uploadMemory = require('../../common/middlewares/uploadMemory.js');

router.get('/master-list', validateAccessToken, controller.masterList);
router.get('/list/:model', validateAccessToken, controller.list);
router.get('/reference-options', validateAccessToken, controller.getReferenceOptions);
router.get('/constants', validateAccessToken, controller.getAppConstants);
router.get('/state/default', validateAccessToken, controller.getDefaultState);
router.post('/create', validateAccessToken, uploadMemory.single('file'), controller.create);
// CSV sample download and upload (must be before /:id routes)
router.get('/sample-file', validateAccessToken, controller.downloadSample);
router.post('/upload', validateAccessToken, uploadMemory.single('file'), controller.uploadData);
router.get('/:id/file-url', validateAccessToken, controller.getFileUrl);
router.get('/:id', validateAccessToken, controller.getById);
router.put('/:id', validateAccessToken, uploadMemory.single('file'), controller.update);
router.delete('/:id', validateAccessToken, controller.remove);

module.exports = router;
