const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES, INQUIRY_STATUS } = require("../../common/utils/constants.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

/**
 * Create a new site visit
 * @param {Object} payload - Site visit data
 * @returns {Object} - Created site visit
 */
const createSiteVisit = async (payload) => {
  const models = getTenantModels();
  const { Inquiry, SiteVisit } = models;
  // Inquiry ID is required except when visit_status is "Pending"
  if (!payload.inquiry_id && payload.visit_status !== "Pending") {
    throw new AppError("Inquiry ID is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  // Handle other_images_videos - convert array to JSON string if needed
  if (Array.isArray(payload.other_images_videos)) {
    payload.other_images_videos = JSON.stringify(payload.other_images_videos);
  }

  // Use a transaction to ensure both site visit creation and inquiry status update succeed or fail together
  const transaction = await models.sequelize.transaction();

  try {
    // Only verify and update inquiry if inquiry_id is provided
    if (payload.inquiry_id) {
      // Verify inquiry exists (within transaction)
      const inquiry = await Inquiry.findOne({
        where: { id: payload.inquiry_id, deleted_at: null },
        transaction,
      });

      if (!inquiry) {
        throw new AppError("Inquiry not found", RESPONSE_STATUS_CODES.NOT_FOUND);
      }

      // If visit_status is "Visited", check if inquiry already has a "Visited" site visit
      if (payload.visit_status === "Visited") {
        const existingVisitedSiteVisit = await SiteVisit.findOne({
          where: {
            inquiry_id: payload.inquiry_id,
            visit_status: "Visited",
            deleted_at: null
          },
          transaction,
        });

        if (existingVisitedSiteVisit) {
          throw new AppError("A site visit with 'Visited' status already exists for this inquiry", RESPONSE_STATUS_CODES.BAD_REQUEST);
        }
      }

      // Define status hierarchy for comparison
      const STATUS_HIERARCHY = {
        [INQUIRY_STATUS.NEW]: 1,
        [INQUIRY_STATUS.CONNECTED]: 2,
        [INQUIRY_STATUS.SITE_VISIT_DONE]: 3,
        [INQUIRY_STATUS.QUOTATION]: 4,
        [INQUIRY_STATUS.UNDER_DISCUSSION]: 5,
      };

      // Get current inquiry status level
      const currentStatusLevel = STATUS_HIERARCHY[inquiry.status] || 0;
      const siteVisitDoneStatusLevel = STATUS_HIERARCHY[INQUIRY_STATUS.SITE_VISIT_DONE];

      // Create the site visit
      const siteVisit = await SiteVisit.create(payload, { transaction });

      // Only update inquiry status to "Site Visit Done" if current status is less than "Site Visit Done"
      if (currentStatusLevel < siteVisitDoneStatusLevel) {
        await inquiry.update(
          { status: INQUIRY_STATUS.SITE_VISIT_DONE },
          { transaction }
        );
      }

      // make inquiry active
      await inquiry.update(
        { is_dead: false },
        { transaction }
      );

      await transaction.commit();
      return siteVisit.toJSON();
    } else {
      // For Pending status without inquiry_id, just create the site visit
      const siteVisit = await SiteVisit.create(payload, { transaction });
      await transaction.commit();
      return siteVisit.toJSON();
    }
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * List site visits with their inquiry details (INNER JOIN)
 * Returns all site visits with their associated inquiry data
 * Main table is SiteVisit, with Inquiry details joined
 * @param {Object} params - { page, limit, q, status, visit_status, sortBy, sortOrder }
 * @returns {Object} - { data, meta }
 */
const listInquiriesWithSiteVisits = async ({
  page = 1,
  limit = 20,
  q = null,
  status = null,
  visit_status = null,
  inquiry_id = null,
  inquiry_id_op = null,
  inquiry_date_of_inquiry_from = null,
  inquiry_date_of_inquiry_to = null,
  inquiry_date_of_inquiry_op = null,
  site_visit_visit_date_from = null,
  site_visit_visit_date_to = null,
  site_visit_visit_date_op = null,
  site_visit_remarks = null,
  site_visit_remarks_op = null,
  site_visit_next_reminder_date_from = null,
  site_visit_next_reminder_date_to = null,
  site_visit_next_reminder_date_op = null,
  inquiry_capacity = null,
  inquiry_capacity_op = null,
  inquiry_capacity_to = null,
  site_visit_roof_type = null,
  site_visit_roof_type_op = null,
  site_visit_schedule_on_from = null,
  site_visit_schedule_on_to = null,
  site_visit_schedule_on_op = null,
  site_visit_created_at_from = null,
  site_visit_created_at_to = null,
  site_visit_created_at_op = null,
  sortBy = null,
  sortOrder = "DESC",
} = {}) => {
  const models = getTenantModels();
  const { Inquiry, SiteVisit } = models;
  const offset = (page - 1) * limit;

  // Build where clause for site visits (main table)
  const siteVisitWhere = { deleted_at: null };

  if (visit_status) {
    siteVisitWhere.visit_status = visit_status;
  }

  if (inquiry_id != null && inquiry_id !== "") {
    const numericId = parseInt(inquiry_id, 10);
    if (!Number.isNaN(numericId)) {
      siteVisitWhere.inquiry_id = numericId;
    }
  }

  if (site_visit_remarks) {
    siteVisitWhere.remarks = { [Op.iLike]: `%${site_visit_remarks}%` };
  }

  if (site_visit_roof_type) {
    siteVisitWhere.roof_type = { [Op.iLike]: `%${site_visit_roof_type}%` };
  }

  if (site_visit_visit_date_from || site_visit_visit_date_to) {
    siteVisitWhere.visit_date = siteVisitWhere.visit_date || {};
    if (site_visit_visit_date_from) siteVisitWhere.visit_date[Op.gte] = site_visit_visit_date_from;
    if (site_visit_visit_date_to) siteVisitWhere.visit_date[Op.lte] = site_visit_visit_date_to;
    if (Reflect.ownKeys(siteVisitWhere.visit_date).length === 0) delete siteVisitWhere.visit_date;
  }

  if (site_visit_next_reminder_date_from || site_visit_next_reminder_date_to) {
    siteVisitWhere.next_reminder_date = siteVisitWhere.next_reminder_date || {};
    if (site_visit_next_reminder_date_from) siteVisitWhere.next_reminder_date[Op.gte] = site_visit_next_reminder_date_from;
    if (site_visit_next_reminder_date_to) siteVisitWhere.next_reminder_date[Op.lte] = site_visit_next_reminder_date_to;
    if (Reflect.ownKeys(siteVisitWhere.next_reminder_date).length === 0) delete siteVisitWhere.next_reminder_date;
  }

  if (site_visit_schedule_on_from || site_visit_schedule_on_to) {
    siteVisitWhere.schedule_on = siteVisitWhere.schedule_on || {};
    if (site_visit_schedule_on_from) siteVisitWhere.schedule_on[Op.gte] = site_visit_schedule_on_from;
    if (site_visit_schedule_on_to) siteVisitWhere.schedule_on[Op.lte] = site_visit_schedule_on_to;
    if (Reflect.ownKeys(siteVisitWhere.schedule_on).length === 0) delete siteVisitWhere.schedule_on;
  }

  if (site_visit_created_at_from || site_visit_created_at_to) {
    siteVisitWhere.created_at = siteVisitWhere.created_at || {};
    if (site_visit_created_at_from) siteVisitWhere.created_at[Op.gte] = site_visit_created_at_from;
    if (site_visit_created_at_to) siteVisitWhere.created_at[Op.lte] = site_visit_created_at_to;
    if (Reflect.ownKeys(siteVisitWhere.created_at).length === 0) delete siteVisitWhere.created_at;
  }

  // Build where clause for inquiries (joined table)
  const inquiryWhere = { deleted_at: null };

  if (status) {
    inquiryWhere.status = status;
  }

  if (inquiry_date_of_inquiry_from || inquiry_date_of_inquiry_to) {
    inquiryWhere.date_of_inquiry = inquiryWhere.date_of_inquiry || {};
    if (inquiry_date_of_inquiry_from) inquiryWhere.date_of_inquiry[Op.gte] = inquiry_date_of_inquiry_from;
    if (inquiry_date_of_inquiry_to) inquiryWhere.date_of_inquiry[Op.lte] = inquiry_date_of_inquiry_to;
    if (Reflect.ownKeys(inquiryWhere.date_of_inquiry).length === 0) delete inquiryWhere.date_of_inquiry;
  }

  if (inquiry_capacity || inquiry_capacity_to) {
    const cap = parseFloat(inquiry_capacity);
    const capTo = parseFloat(inquiry_capacity_to);
    if (!Number.isNaN(cap) || !Number.isNaN(capTo)) {
      const cond = {};
      const opStr = (inquiry_capacity_op || "").toLowerCase();
      if (opStr === "between" && !Number.isNaN(cap) && !Number.isNaN(capTo)) {
        cond[Op.between] = [cap, capTo];
      } else if (opStr === "gt" && !Number.isNaN(cap)) {
        cond[Op.gt] = cap;
      } else if (opStr === "lt" && !Number.isNaN(cap)) {
        cond[Op.lt] = cap;
      } else if (opStr === "gte" && !Number.isNaN(cap)) {
        cond[Op.gte] = cap;
      } else if (opStr === "lte" && !Number.isNaN(cap)) {
        cond[Op.lte] = cap;
      } else if (!Number.isNaN(cap)) {
        cond[Op.eq] = cap;
      }
      if (Reflect.ownKeys(cond).length > 0) inquiryWhere.capacity = cond;
    }
  }

  // Handle search query - search in both site visit and inquiry fields
  let inquiryIdsFromSearch = [];
  if (q) {
    // Build search conditions for site visits
    const siteVisitSearchConditions = [
      { remarks: { [Op.iLike]: `%${q}%` } },
      { visit_status: { [Op.iLike]: `%${q}%` } },
      { roof_type: { [Op.iLike]: `%${q}%` } },
      { solar_panel_size_capacity: { [Op.iLike]: `%${q}%` } },
      { inverter_size_capacity: { [Op.iLike]: `%${q}%` } },
      { earthing_cable_size_location: { [Op.iLike]: `%${q}%` } },
    ];

    // If query is numeric, also search in site visit ID
    const numericQuery = parseInt(q, 10);
    if (!isNaN(numericQuery)) {
      siteVisitSearchConditions.push({ id: numericQuery });
    }

    // Build search conditions for inquiries
    const inquirySearchConditions = [
      { remarks: { [Op.iLike]: `%${q}%` } },
      { reference_from: { [Op.iLike]: `%${q}%` } },
    ];

    // If query is numeric, also search in inquiry ID
    if (!isNaN(numericQuery)) {
      inquirySearchConditions.push({ id: numericQuery });
    }

    // Find inquiries that match the search criteria
    const matchingInquiries = await Inquiry.findAll({
      where: {
        ...inquiryWhere,
        [Op.or]: inquirySearchConditions,
      },
      attributes: ['id'],
      raw: true,
    });

    inquiryIdsFromSearch = matchingInquiries.map(inq => inq.id);

    // Combine site visit search conditions with inquiry ID matches
    // Site visit matches if: (site visit fields match) OR (inquiry_id is in matching inquiries)
    const combinedSiteVisitConditions = [...siteVisitSearchConditions];
    if (inquiryIdsFromSearch.length > 0) {
      combinedSiteVisitConditions.push({ inquiry_id: { [Op.in]: inquiryIdsFromSearch } });
    }

    siteVisitWhere[Op.or] = combinedSiteVisitConditions;
  }

  // Build the query options
  const queryOptions = {
    where: siteVisitWhere,
    include: [
      {
        model: Inquiry,
        as: "inquiry",
        where: inquiryWhere,
        required: true, // INNER JOIN - only site visits with valid inquiries
      },
    ],
    distinct: true,
    limit: limit > 0 ? limit : undefined,
    offset: limit > 0 ? offset : undefined,
  };

  // Apply sorting
  if (sortBy) {
    // Map sortBy field to actual model field
    if (sortBy.startsWith("site_visit_")) {
      const field = sortBy.replace("site_visit_", "");
      queryOptions.order = [[field, sortOrder.toUpperCase()]];
    } else if (sortBy.startsWith("inquiry_")) {
      const field = sortBy.replace("inquiry_", "");
      // Map inquiry field names (e.g., inquiry_date_of_inquiry -> date_of_inquiry)
      queryOptions.order = [[{ model: Inquiry, as: "inquiry" }, field, sortOrder.toUpperCase()]];
    } else {
      // Try as site visit field directly
      queryOptions.order = [[sortBy, sortOrder.toUpperCase()]];
    }
  } else {
    // Default to site visit id descending (latest first, uses PK index)
    queryOptions.order = [["id", "DESC"]];
  }

  // Get total count before pagination
  const total = await SiteVisit.count({
    where: siteVisitWhere,
    include: [
      {
        model: Inquiry,
        as: "inquiry",
        where: inquiryWhere,
        required: true,
      },
    ],
    distinct: true,
  });

  // Fetch site visits with inquiry details
  const siteVisits = await SiteVisit.findAll(queryOptions);

  // Flatten the result: create one row per site visit with inquiry details
  const flattenedData = siteVisits.map((siteVisit) => {
    const siteVisitData = siteVisit.toJSON();
    const inquiryData = siteVisitData.inquiry || {};

    return {
      // Site visit fields (primary)
      site_visit_id: siteVisitData.id,
      site_visit_visit_status: siteVisitData.visit_status,
      site_visit_remarks: siteVisitData.remarks,
      site_visit_next_reminder_date: siteVisitData.next_reminder_date,
      site_visit_site_latitude: siteVisitData.site_latitude,
      site_visit_site_longitude: siteVisitData.site_longitude,
      site_visit_has_shadow_casting_object: siteVisitData.has_shadow_casting_object,
      site_visit_shadow_reduce_suggestion: siteVisitData.shadow_reduce_suggestion,
      site_visit_height_of_parapet: siteVisitData.height_of_parapet,
      site_visit_roof_type: siteVisitData.roof_type,
      site_visit_solar_panel_size_capacity: siteVisitData.solar_panel_size_capacity,
      site_visit_approx_roof_area_sqft: siteVisitData.approx_roof_area_sqft,
      site_visit_inverter_size_capacity: siteVisitData.inverter_size_capacity,
      site_visit_earthing_cable_size_location: siteVisitData.earthing_cable_size_location,
      site_visit_visit_photo: siteVisitData.visit_photo,
      site_visit_left_corner_site_image: siteVisitData.left_corner_site_image,
      site_visit_right_corner_site_image: siteVisitData.right_corner_site_image,
      site_visit_left_top_corner_site_image: siteVisitData.left_top_corner_site_image,
      site_visit_right_top_corner_site_image: siteVisitData.right_top_corner_site_image,
      site_visit_drawing_image: siteVisitData.drawing_image,
      site_visit_house_building_outside_photo: siteVisitData.house_building_outside_photo,
      site_visit_other_images_videos: siteVisitData.other_images_videos,
      site_visit_do_not_send_message: siteVisitData.do_not_send_message,
      site_visit_visit_date: siteVisitData.visit_date,
      site_visit_visited_by: siteVisitData.visited_by,
      site_visit_visit_assign_to: siteVisitData.visit_assign_to,
      site_visit_schedule_on: siteVisitData.schedule_on,
      site_visit_schedule_remarks: siteVisitData.schedule_remarks,
      site_visit_status: siteVisitData.status,
      site_visit_created_at: siteVisitData.created_at,
      site_visit_updated_at: siteVisitData.updated_at,
      // Inquiry fields (joined)
      inquiry_id: inquiryData.id,
      inquiry_date_of_inquiry: inquiryData.date_of_inquiry,
      inquiry_inquiry_source_id: inquiryData.inquiry_source_id,
      inquiry_inquiry_by: inquiryData.inquiry_by,
      inquiry_handled_by: inquiryData.handled_by,
      inquiry_channel_partner: inquiryData.channel_partner,
      inquiry_branch_id: inquiryData.branch_id,
      inquiry_project_scheme_id: inquiryData.project_scheme_id,
      inquiry_capacity: inquiryData.capacity,
      inquiry_order_type: inquiryData.order_type,
      inquiry_discom_id: inquiryData.discom_id,
      inquiry_rating: inquiryData.rating,
      inquiry_remarks: inquiryData.remarks,
      inquiry_next_reminder_date: inquiryData.next_reminder_date,
      inquiry_reference_from: inquiryData.reference_from,
      inquiry_estimated_cost: inquiryData.estimated_cost,
      inquiry_payment_type: inquiryData.payment_type,
      inquiry_do_not_send_message: inquiryData.do_not_send_message,
      inquiry_status: inquiryData.status,
      inquiry_created_at: inquiryData.created_at,
      inquiry_updated_at: inquiryData.updated_at,
    };
  });

  return {
    data: flattenedData,
    meta: {
      page,
      limit,
      total,
      pages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  };
};

const exportInquiriesWithSiteVisits = async (params = {}) => {
  const { data } = await listInquiriesWithSiteVisits({
    page: 1,
    limit: 10000,
    ...params,
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Site Visits");
  worksheet.columns = [
    { header: "Inquiry ID", key: "inquiry_id", width: 12 },
    { header: "Visit Status", key: "site_visit_visit_status", width: 14 },
    { header: "Visit Date", key: "site_visit_visit_date", width: 12 },
    { header: "Schedule On", key: "site_visit_schedule_on", width: 12 },
    { header: "Roof Type", key: "site_visit_roof_type", width: 14 },
    { header: "Capacity", key: "inquiry_capacity", width: 12 },
    { header: "Inquiry Status", key: "inquiry_status", width: 14 },
    { header: "Remarks", key: "site_visit_remarks", width: 28 },
    { header: "Created At", key: "site_visit_created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
  (data || []).forEach((r) => {
    worksheet.addRow({
      inquiry_id: r.inquiry_id ?? "",
      site_visit_visit_status: r.site_visit_visit_status ?? "",
      site_visit_visit_date: r.site_visit_visit_date ? new Date(r.site_visit_visit_date).toISOString().split("T")[0] : "",
      site_visit_schedule_on: r.site_visit_schedule_on ? new Date(r.site_visit_schedule_on).toISOString().split("T")[0] : "",
      site_visit_roof_type: r.site_visit_roof_type ?? "",
      inquiry_capacity: r.inquiry_capacity ?? "",
      inquiry_status: r.inquiry_status ?? "",
      site_visit_remarks: r.site_visit_remarks ?? "",
      site_visit_created_at: r.site_visit_created_at ? new Date(r.site_visit_created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

module.exports = {
  createSiteVisit,
  listInquiriesWithSiteVisits,
  exportInquiriesWithSiteVisits,
};

