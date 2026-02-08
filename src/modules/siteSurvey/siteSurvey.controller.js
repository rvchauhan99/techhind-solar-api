const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const AppError = require("../../common/errors/AppError.js");
const siteSurveyService = require("./siteSurvey.service.js");
const bucketService = require("../../common/services/bucket.service.js");

const FILE_UNAVAILABLE_MESSAGE =
    "We couldn't save your documents right now. Please try again in a few minutes.";

/**
 * Create a new site survey with file uploads (bucket, private)
 */
const create = asyncHandler(async (req, res) => {
    const payload = { ...req.body };

    if (req.files) {
        try {
            const uploadOne = async (file) => {
                const result = await bucketService.uploadFile(file, { prefix: "site-surveys", acl: "private" });
                return result.path;
            };
            if (req.files.building_front_photo && req.files.building_front_photo[0]) {
                payload.building_front_photo = await uploadOne(req.files.building_front_photo[0]);
            }
            if (req.files.roof_front_left_photo && req.files.roof_front_left_photo[0]) {
                payload.roof_front_left_photo = await uploadOne(req.files.roof_front_left_photo[0]);
            }
            if (req.files.roof_front_right_photo && req.files.roof_front_right_photo[0]) {
                payload.roof_front_right_photo = await uploadOne(req.files.roof_front_right_photo[0]);
            }
            if (req.files.roof_rear_left_photo && req.files.roof_rear_left_photo[0]) {
                payload.roof_rear_left_photo = await uploadOne(req.files.roof_rear_left_photo[0]);
            }
            if (req.files.roof_rear_right_photo && req.files.roof_rear_right_photo[0]) {
                payload.roof_rear_right_photo = await uploadOne(req.files.roof_rear_right_photo[0]);
            }
            if (req.files.drawing_photo && req.files.drawing_photo[0]) {
                payload.drawing_photo = await uploadOne(req.files.drawing_photo[0]);
            }
            if (req.files.shadow_object_photo && req.files.shadow_object_photo[0]) {
                payload.shadow_object_photo = await uploadOne(req.files.shadow_object_photo[0]);
            }
        } catch (error) {
            console.error("Error uploading site survey files to bucket:", error);
            throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
        }
    }

    // Parse boolean field
    if (payload.has_shadow_object !== undefined) {
        payload.has_shadow_object = payload.has_shadow_object === "true" || payload.has_shadow_object === true;
    }

    // Parse site_visit_id
    if (payload.site_visit_id) {
        payload.site_visit_id = parseInt(payload.site_visit_id, 10);
    }

    // Parse surveyor_id if provided
    if (payload.surveyor_id && payload.surveyor_id !== "" && payload.surveyor_id !== null) {
        const surveyorId = parseInt(payload.surveyor_id, 10);
        if (!isNaN(surveyorId)) {
            payload.surveyor_id = surveyorId;
        } else {
            payload.surveyor_id = null;
        }
    } else {
        payload.surveyor_id = null;
    }

    // Parse bom_detail if provided (comes as JSON string from FormData)
    if (payload.bom_detail && typeof payload.bom_detail === 'string') {
        try {
            payload.bom_detail = JSON.parse(payload.bom_detail);
        } catch (error) {
            return responseHandler.sendError(res, "Invalid bom_detail format", 400);
        }
    } else if (!payload.bom_detail) {
        payload.bom_detail = [];
    }

    // Validate survey_date
    if (!payload.survey_date || payload.survey_date === "" || payload.survey_date === "Invalid date") {
        return responseHandler.sendError(res, "Survey date is required and must be a valid date", 400);
    }

    // Validate date format
    if (payload.survey_date && payload.survey_date !== "Invalid date") {
        const surveyDate = new Date(payload.survey_date);
        if (isNaN(surveyDate.getTime())) {
            return responseHandler.sendError(res, "Survey date must be a valid date", 400);
        }
    }

    // Validate site_visit_id
    if (!payload.site_visit_id) {
        return responseHandler.sendError(res, "Site visit ID is required", 400);
    }

    try {
        const created = await siteSurveyService.createSiteSurvey(payload);
        return responseHandler.sendSuccess(res, created, "Site survey created successfully", 201);
    } catch (error) {
        // Handle specific validation errors from service
        if (error.message.includes("not found") || error.message.includes("already exists") || error.message.includes("can only be created")) {
            return responseHandler.sendError(res, error.message, 400);
        }
        throw error;
    }
});

/**
 * Get signed URL for a site survey document (photo) by bucket key
 */
const getDocumentUrl = asyncHandler(async (req, res) => {
    const key = req.query.path;
    if (!key) {
        return responseHandler.sendError(res, "path (bucket key) is required", 400);
    }
    if (key.startsWith("/")) {
        return responseHandler.sendError(res, "Legacy path; use static URL", 400);
    }
    if (!key.startsWith("site-surveys/")) {
        return responseHandler.sendError(res, "Invalid path for site survey documents", 400);
    }
    try {
        const url = await bucketService.getSignedUrl(key, 3600);
        return responseHandler.sendSuccess(
            res,
            { url, expires_in: 3600 },
            "Signed URL generated",
            200
        );
    } catch (error) {
        console.error("Error generating signed URL:", error);
        return responseHandler.sendError(res, FILE_UNAVAILABLE_MESSAGE, 503);
    }
});

module.exports = {
    create,
    getDocumentUrl,
};
