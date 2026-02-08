const { Router } = require('express');
const controller = require('./userMaster.controller.js');
const { validateAccessToken } = require("../../common/middlewares/auth.js");

const router = Router();

router.get('/list', validateAccessToken, controller.list);
router.get('/export', validateAccessToken, controller.exportList);
router.post('/create', validateAccessToken, controller.create);
router.get('/profile', validateAccessToken, controller.getProfile);
router.get('/:id', validateAccessToken, controller.getById);
router.put('/:id', validateAccessToken, controller.update);
router.delete('/:id', validateAccessToken, controller.remove);
router.put('/:id/set-password', validateAccessToken, controller.setPassword);

module.exports = router;
