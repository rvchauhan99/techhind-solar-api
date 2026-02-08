const { Router } = require("express");
const controller = require("./siteVisit.controller.js");
const { requireAuthWithTenant } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

const router = Router();

// Define file fields for multer.fields()
const fileFields = [
  { name: "visit_photo", maxCount: 1 },
  { name: "left_corner_site_image", maxCount: 1 },
  { name: "right_corner_site_image", maxCount: 1 },
  { name: "left_top_corner_site_image", maxCount: 1 },
  { name: "right_top_corner_site_image", maxCount: 1 },
  { name: "drawing_image", maxCount: 1 },
  { name: "house_building_outside_photo", maxCount: 1 },
  { name: "other_images_videos", maxCount: 20 }, // Multiple files allowed
];

router.get("/list", ...requireAuthWithTenant, controller.list);
router.get("/export", ...requireAuthWithTenant, controller.exportList);
router.get("/document-url", ...requireAuthWithTenant, controller.getDocumentUrl);
router.get("/roof-types", ...requireAuthWithTenant, controller.getRoofTypes);
router.post("/create", ...requireAuthWithTenant, uploadMemory.fields(fileFields), controller.create);

module.exports = router;

