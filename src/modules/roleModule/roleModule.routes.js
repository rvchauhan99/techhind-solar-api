const { Router } = require('express');
const controller = require('./roleModule.controller.js');
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");

const router = Router();

router.get('/list', ...requireAuthWithTenant, controller.list);
router.get('/export', ...requireAuthWithTenant, controller.exportList);
router.get('/role/:roleId', ...requireAuthWithTenant, controller.getByRoleId);
router.post('/create', ...requireAuthWithTenant, controller.create);
router.get('/:id', ...requireAuthWithTenant, controller.getById);
router.put('/:id', ...requireAuthWithTenant, controller.update);
router.delete('/:id', ...requireAuthWithTenant, controller.remove);

module.exports = router;
