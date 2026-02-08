const { Router } = require("express");
const controller = require("./siteSurvey.controller.js");
const { validateAccessToken } = require("../../common/middlewares/auth.js");
const uploadMemory = require("../../common/middlewares/uploadMemory.js");

const router = Router();

// Define file fields for multer.fields()
const fileFields = [
    { name: "building_front_photo", maxCount: 1 },
    { name: "roof_front_left_photo", maxCount: 1 },
    { name: "roof_front_right_photo", maxCount: 1 },
    { name: "roof_rear_left_photo", maxCount: 1 },
    { name: "roof_rear_right_photo", maxCount: 1 },
    { name: "drawing_photo", maxCount: 1 },
    { name: "shadow_object_photo", maxCount: 1 },
];

router.get("/document-url", validateAccessToken, controller.getDocumentUrl);
router.post("/create", validateAccessToken, uploadMemory.fields(fileFields), controller.create);

module.exports = router;
