const { Router } = require('express');
const controller = require('./moduleMaster.controller.js');
const { validateAccessToken } = require("../../common/middlewares/auth.js");

const router = Router();

// Public endpoints; add auth middleware if required
router.get('/list', validateAccessToken, controller.list);
router.get('/export', validateAccessToken, controller.exportList);
router.post('/create', validateAccessToken, controller.create);
router.get('/:id', validateAccessToken, controller.getById);
router.put('/:id', validateAccessToken, controller.update);
router.delete('/:id', validateAccessToken, controller.remove);

module.exports = router;
