const { Router } = require('express');
const controller = require('./userMaster.controller.js');
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");

const router = Router();

router.get('/list', ...requireAuthWithTenant, controller.list);
router.get('/export', ...requireAuthWithTenant, controller.exportList);
router.post('/create', ...requireAuthWithTenant, controller.create);
router.get('/profile', ...requireAuthWithTenant, controller.getProfile);
router.get('/:id', ...requireAuthWithTenant, controller.getById);
router.put('/:id', ...requireAuthWithTenant, controller.update);
router.delete('/:id', ...requireAuthWithTenant, controller.remove);
router.put('/:id/set-password', ...requireAuthWithTenant, controller.setPassword);

module.exports = router;
