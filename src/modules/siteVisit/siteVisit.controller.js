const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const AppError = require("../../common/errors/AppError.js");
const siteVisitService = require("./siteVisit.service.js");
const bucketService = require("../../common/services/bucket.service.js");
const { ROOF_TYPES } = require("../../common/utils/constants.js");

const FILE_UNAVAILABLE_MESSAGE =
  "We couldn't save your documents right now. Please try again in a few minutes.";

/**
 * List inquiries with their site visits (LEFT JOIN)
 */
const list = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    q,
    status,
    visit_status,
    inquiry_id,
    inquiry_id_op,
    inquiry_date_of_inquiry_from,
    inquiry_date_of_inquiry_to,
    inquiry_date_of_inquiry_op,
    site_visit_visit_date_from,
    site_visit_visit_date_to,
    site_visit_visit_date_op,
    site_visit_remarks,
    site_visit_remarks_op,
    site_visit_next_reminder_date_from,
    site_visit_next_reminder_date_to,
    site_visit_next_reminder_date_op,
    inquiry_capacity,
    inquiry_capacity_op,
    inquiry_capacity_to,
    site_visit_roof_type,
    site_visit_roof_type_op,
    site_visit_schedule_on_from,
    site_visit_schedule_on_to,
    site_visit_schedule_on_op,
    site_visit_created_at_from,
    site_visit_created_at_to,
    site_visit_created_at_op,
    sortBy,
    sortOrder,
  } = req.query;
  const result = await siteVisitService.listInquiriesWithSiteVisits({
    page: parseInt(page, 10) || 1,
    limit: parseInt(limit, 10) || 20,
    q,
    status,
    visit_status,
    inquiry_id: inquiry_id ? parseInt(inquiry_id, 10) : null,
    inquiry_id_op,
    inquiry_date_of_inquiry_from,
    inquiry_date_of_inquiry_to,
    inquiry_date_of_inquiry_op,
    site_visit_visit_date_from,
    site_visit_visit_date_to,
    site_visit_visit_date_op,
    site_visit_remarks,
    site_visit_remarks_op,
    site_visit_next_reminder_date_from,
    site_visit_next_reminder_date_to,
    site_visit_next_reminder_date_op,
    inquiry_capacity,
    inquiry_capacity_op,
    inquiry_capacity_to,
    site_visit_roof_type,
    site_visit_roof_type_op,
    site_visit_schedule_on_from,
    site_visit_schedule_on_to,
    site_visit_schedule_on_op,
    site_visit_created_at_from,
    site_visit_created_at_to,
    site_visit_created_at_op,
    sortBy,
    sortOrder,
  });
  return responseHandler.sendSuccess(res, result, "Inquiries with site visits fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
  const {
    q,
    status,
    visit_status,
    inquiry_id,
    inquiry_date_of_inquiry_from,
    inquiry_date_of_inquiry_to,
    site_visit_visit_date_from,
    site_visit_visit_date_to,
    site_visit_remarks,
    site_visit_next_reminder_date_from,
    site_visit_next_reminder_date_to,
    inquiry_capacity,
    inquiry_capacity_op,
    inquiry_capacity_to,
    site_visit_roof_type,
    site_visit_schedule_on_from,
    site_visit_schedule_on_to,
    site_visit_created_at_from,
    site_visit_created_at_to,
    sortBy,
    sortOrder,
  } = req.query;
  const buffer = await siteVisitService.exportInquiriesWithSiteVisits({
    q,
    status,
    visit_status,
    inquiry_id: inquiry_id ? parseInt(inquiry_id, 10) : null,
    inquiry_date_of_inquiry_from,
    inquiry_date_of_inquiry_to,
    site_visit_visit_date_from,
    site_visit_visit_date_to,
    site_visit_remarks,
    site_visit_next_reminder_date_from,
    site_visit_next_reminder_date_to,
    inquiry_capacity,
    inquiry_capacity_op,
    inquiry_capacity_to,
    site_visit_roof_type,
    site_visit_schedule_on_from,
    site_visit_schedule_on_to,
    site_visit_created_at_from,
    site_visit_created_at_to,
    sortBy,
    sortOrder,
  });
  const filename = `site-visits-${new Date().toISOString().split("T")[0]}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(buffer);
});

/**
 * Create a new site visit with file uploads
 */
const create = asyncHandler(async (req, res) => {
  const payload = { ...req.body };

  // Handle file uploads - upload to bucket (private), store keys in payload
  if (req.files) {
    try {
      const uploadOne = async (file) => {
        const result = await bucketService.uploadFile(file, { prefix: "site-visits", acl: "private" });
        return result.path;
      };
      if (req.files.visit_photo && req.files.visit_photo[0]) {
        payload.visit_photo = await uploadOne(req.files.visit_photo[0]);
      }
      if (req.files.left_corner_site_image && req.files.left_corner_site_image[0]) {
        payload.left_corner_site_image = await uploadOne(req.files.left_corner_site_image[0]);
      }
      if (req.files.right_corner_site_image && req.files.right_corner_site_image[0]) {
        payload.right_corner_site_image = await uploadOne(req.files.right_corner_site_image[0]);
      }
      if (req.files.left_top_corner_site_image && req.files.left_top_corner_site_image[0]) {
        payload.left_top_corner_site_image = await uploadOne(req.files.left_top_corner_site_image[0]);
      }
      if (req.files.right_top_corner_site_image && req.files.right_top_corner_site_image[0]) {
        payload.right_top_corner_site_image = await uploadOne(req.files.right_top_corner_site_image[0]);
      }
      if (req.files.drawing_image && req.files.drawing_image[0]) {
        payload.drawing_image = await uploadOne(req.files.drawing_image[0]);
      }
      if (req.files.house_building_outside_photo && req.files.house_building_outside_photo[0]) {
        payload.house_building_outside_photo = await uploadOne(req.files.house_building_outside_photo[0]);
      }
      if (req.files.other_images_videos && req.files.other_images_videos.length > 0) {
        payload.other_images_videos = await Promise.all(
          req.files.other_images_videos.map((file) => uploadOne(file))
        );
      }
    } catch (error) {
      console.error("Error uploading site visit files to bucket:", error);
      throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }
  }

  // Parse boolean fields
  if (payload.has_shadow_casting_object !== undefined) {
    payload.has_shadow_casting_object = payload.has_shadow_casting_object === "true" || payload.has_shadow_casting_object === true;
  }
  if (payload.do_not_send_message !== undefined) {
    payload.do_not_send_message = payload.do_not_send_message === "true" || payload.do_not_send_message === true;
  }

  // Parse numeric fields - convert empty strings to null, then parse valid numbers
  const numericFields = [
    'site_latitude',
    'site_longitude',
    'height_of_parapet',
    'solar_panel_size_capacity',
    'approx_roof_area_sqft',
    'inverter_size_capacity',
  ];

  numericFields.forEach(field => {
    if (payload[field] !== undefined) {
      if (payload[field] === "" || payload[field] === null) {
        payload[field] = null;
      } else {
        const numValue = parseFloat(payload[field]);
        payload[field] = isNaN(numValue) ? null : numValue;
      }
    }
  });

  // Parse inquiry_id
  if (payload.inquiry_id) {
    payload.inquiry_id = parseInt(payload.inquiry_id, 10);
  }

  // Parse visited_by if provided
  if (payload.visited_by && payload.visited_by !== "" && payload.visited_by !== null) {
    const visitedBy = parseInt(payload.visited_by, 10);
    if (!isNaN(visitedBy)) {
      payload.visited_by = visitedBy;
    } else {
      payload.visited_by = null;
    }
  } else {
    payload.visited_by = null;
  }

  // Parse visit_assign_to if provided
  if (payload.visit_assign_to && payload.visit_assign_to !== "" && payload.visit_assign_to !== null) {
    const visitAssignTo = parseInt(payload.visit_assign_to, 10);
    if (!isNaN(visitAssignTo)) {
      payload.visit_assign_to = visitAssignTo;
    } else {
      payload.visit_assign_to = null;
    }
  } else {
    payload.visit_assign_to = null;
  }

  // Handle date fields - convert empty strings to null for optional fields
  if (payload.visit_date === "" || payload.visit_date === undefined || payload.visit_date === null || payload.visit_date === "Invalid date") {
    payload.visit_date = null;
  }

  // Handle schedule_on date field - convert empty strings to null for optional fields
  if (payload.schedule_on === "" || payload.schedule_on === undefined || payload.schedule_on === null || payload.schedule_on === "Invalid date") {
    payload.schedule_on = null;
  }

  // Validate next_reminder_date - only required if visit_status is "Visited"
  if (payload.visit_status === "Visited") {
    if (!payload.next_reminder_date || payload.next_reminder_date === "" || payload.next_reminder_date === "Invalid date") {
      return responseHandler.sendError(res, "Next reminder date is required and must be a valid date", 400);
    }

    // Validate next_reminder_date format
    if (payload.next_reminder_date && payload.next_reminder_date !== "Invalid date") {
      const reminderDate = new Date(payload.next_reminder_date);
      if (isNaN(reminderDate.getTime())) {
        return responseHandler.sendError(res, "Next reminder date must be a valid date", 400);
      }
    }
  } else {
    // For Pending, Rescheduled, and Cancelled status, next_reminder_date is optional
    if (payload.next_reminder_date === "" || payload.next_reminder_date === "Invalid date") {
      payload.next_reminder_date = null;
    }
  }

  // Validate date format - if it's an invalid date string, convert to null for optional fields
  if (payload.visit_date && payload.visit_date !== null && payload.visit_date !== "Invalid date") {
    const visitDate = new Date(payload.visit_date);
    if (isNaN(visitDate.getTime())) {
      payload.visit_date = null;
    }
  }

  // Validate schedule_on date format
  if (payload.schedule_on && payload.schedule_on !== null && payload.schedule_on !== "Invalid date") {
    const scheduleDate = new Date(payload.schedule_on);
    if (isNaN(scheduleDate.getTime())) {
      payload.schedule_on = null;
    }
  }

  const created = await siteVisitService.createSiteVisit(payload);
  return responseHandler.sendSuccess(res, created, "Site visit created", 201);
});

/**
 * Get signed URL for a site visit document (photo/image) by bucket key
 */
const getDocumentUrl = asyncHandler(async (req, res) => {
  const key = req.query.path;
  if (!key) {
    return responseHandler.sendError(res, "path (bucket key) is required", 400);
  }
  if (key.startsWith("/")) {
    return responseHandler.sendError(res, "Legacy path; use static URL", 400);
  }
  if (!key.startsWith("site-visits/")) {
    return responseHandler.sendError(res, "Invalid path for site visit documents", 400);
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

/**
 * Get roof types constants
 */
const getRoofTypes = asyncHandler(async (req, res) => {
  return responseHandler.sendSuccess(res, ROOF_TYPES, "Roof types fetched", 200);
});

module.exports = {
  list,
  exportList,
  create,
  getDocumentUrl,
  getRoofTypes,
};

