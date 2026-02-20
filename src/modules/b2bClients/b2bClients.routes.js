"use strict";

const { Router } = require("express");
const controller = require("./b2bClients.controller.js");

const router = Router();

router.get("/", controller.list);
router.get("/next-client-code", controller.getNextClientCode);
router.get("/ship-tos", controller.listShipTos);
router.post("/ship-tos", controller.createShipTo);
router.put("/ship-tos/:id", controller.updateShipTo);
router.delete("/ship-tos/:id", controller.deleteShipTo);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
