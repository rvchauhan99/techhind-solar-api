const { Router } = require('express');
const controller = require('./roleModule.controller.js');
const { validateAccessToken } = require("../../common/middlewares/auth.js");

const router = Router();

router.get('/list', validateAccessToken, controller.list);
router.get('/export', validateAccessToken, controller.exportList);
router.get('/role/:roleId', validateAccessToken, controller.getByRoleId);
router.get('/permission/:moduleId', validateAccessToken, controller.getPermission);
router.post('/create', validateAccessToken, controller.create);
router.get('/:id', validateAccessToken, controller.getById);
router.put('/:id', validateAccessToken, controller.update);
router.delete('/:id', validateAccessToken, controller.remove);

module.exports = router;
