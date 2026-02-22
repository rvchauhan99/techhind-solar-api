const { Router } = require('express');
const controller = require('./userMaster.controller.js');
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const {
  requireModulePermission,
  requireOpenedModuleReadPermission,
} = require("../../common/middlewares/modulePermission.js");

const router = Router();
const userMasterManage = (action) => requireModulePermission({ moduleRoute: "/user-master", action });
const userMasterRefRead = requireOpenedModuleReadPermission({ fallbackModuleRoute: "/user-master" });

router.get('/list', ...requireAuthWithTenant, userMasterRefRead, controller.list);
router.get('/export', ...requireAuthWithTenant, userMasterManage("read"), controller.exportList);
router.post('/create', ...requireAuthWithTenant, userMasterManage("create"), controller.create);
router.get('/profile', ...requireAuthWithTenant, userMasterRefRead, controller.getProfile);
router.get('/:id', ...requireAuthWithTenant, userMasterRefRead, controller.getById);
router.put('/:id', ...requireAuthWithTenant, userMasterManage("update"), controller.update);
router.delete('/:id', ...requireAuthWithTenant, userMasterManage("delete"), controller.remove);
router.put('/:id/set-password', ...requireAuthWithTenant, userMasterManage("update"), controller.setPassword);

module.exports = router;
