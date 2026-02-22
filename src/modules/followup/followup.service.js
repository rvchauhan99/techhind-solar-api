const ExcelJS = require("exceljs");
const { Sequelize, Op } = require("sequelize");
const db = require("../../models/index.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const AppError = require("../../common/errors/AppError.js");
const { RESPONSE_STATUS_CODES, FOLLOWUP_RATING, INQUIRY_STATUS } = require("../../common/utils/constants.js");

const createFollowup = async (payload, transaction = null) => {
  const models = getTenantModels();
  const { Followup, Inquiry, User } = models;
  // Validation: Check required fields
  if (!payload.inquiry_id) {
    throw new AppError("Inquiry ID is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  if (!payload.inquiry_status) {
    throw new AppError("Inquiry status is required", RESPONSE_STATUS_CODES.BAD_REQUEST);
  }

  // Verify inquiry exists
  const inquiry = await Inquiry.findOne({
    where: { id: payload.inquiry_id, deleted_at: null },
    transaction,
  });

  if (!inquiry) {
    throw new AppError("Inquiry not found", RESPONSE_STATUS_CODES.NOT_FOUND);
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
  const connectedStatusLevel = STATUS_HIERARCHY[INQUIRY_STATUS.CONNECTED];

  // Only update inquiry status to "Connected" if current status is less than "Connected"
  if (currentStatusLevel < connectedStatusLevel) {
    await inquiry.update(
      { status: INQUIRY_STATUS.CONNECTED },
      { transaction }
    );
  }

  // Verify call_by user exists if provided
  if (payload.call_by) {
    const user = await User.findOne({
      where: { id: payload.call_by, deleted_at: null },
      transaction,
    });

    if (!user) {
      throw new AppError("User not found", RESPONSE_STATUS_CODES.NOT_FOUND);
    }

    // mark inquiry as live 
    await inquiry.update(
      { is_dead: false },
      { transaction }
    );
  }

  const createPayload = {
    inquiry_id: payload.inquiry_id,
    inquiry_status: payload.inquiry_status,
    remarks: payload.remarks || null,
    next_reminder: payload.next_reminder || null,
    call_by: payload.call_by || null,
    is_schedule_site_visit: payload.is_schedule_site_visit !== undefined ? payload.is_schedule_site_visit : false,
    is_msg_send_to_customer: payload.is_msg_send_to_customer !== undefined ? payload.is_msg_send_to_customer : false,
    rating: payload.rating || null,
  };

  const followup = await Followup.create(createPayload, { transaction });

  // Fetch with associations
  const createdFollowup = await Followup.findOne({
    where: { id: followup.id },
    include: [
      {
        model: Inquiry,
        as: "inquiry",
        attributes: ["id", "date_of_inquiry", "status"],
        required: false,
      },
      {
        model: User,
        as: "callByUser",
        attributes: ["id", "name", "email"],
        required: false,
      },
    ],
    transaction,
  });

  return createdFollowup.toJSON();
};

const updateFollowup = async (id, payload, transaction = null) => {
  const models = getTenantModels();
  const { Followup, Inquiry, User } = models;
  const followup = await Followup.findOne({
    where: { id, deleted_at: null },
    transaction,
  });

  if (!followup) {
    throw new AppError("Followup not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  // Verify inquiry exists if inquiry_id is being updated
  if (payload.inquiry_id && payload.inquiry_id !== followup.inquiry_id) {
    const inquiry = await Inquiry.findOne({
      where: { id: payload.inquiry_id, deleted_at: null },
      transaction,
    });

    if (!inquiry) {
      throw new AppError("Inquiry not found", RESPONSE_STATUS_CODES.NOT_FOUND);
    }
  }

  // Verify call_by user exists if provided
  if (payload.call_by) {
    const user = await User.findOne({
      where: { id: payload.call_by, deleted_at: null },
      transaction,
    });

    if (!user) {
      throw new AppError("User not found", RESPONSE_STATUS_CODES.NOT_FOUND);
    }
  }

  const updatePayload = {
    inquiry_id: payload.inquiry_id !== undefined ? payload.inquiry_id : followup.inquiry_id,
    inquiry_status: payload.inquiry_status !== undefined ? payload.inquiry_status : followup.inquiry_status,
    remarks: payload.remarks !== undefined ? payload.remarks : followup.remarks,
    next_reminder: payload.next_reminder !== undefined ? payload.next_reminder : followup.next_reminder,
    call_by: payload.call_by !== undefined ? payload.call_by : followup.call_by,
    is_schedule_site_visit: payload.is_schedule_site_visit !== undefined ? payload.is_schedule_site_visit : followup.is_schedule_site_visit,
    is_msg_send_to_customer: payload.is_msg_send_to_customer !== undefined ? payload.is_msg_send_to_customer : followup.is_msg_send_to_customer,
    rating: payload.rating !== undefined ? payload.rating : followup.rating,
  };

  await followup.update(updatePayload, { transaction });

  // Fetch with associations
  const updatedFollowup = await Followup.findOne({
    where: { id: followup.id },
    include: [
      {
        model: Inquiry,
        as: "inquiry",
        attributes: ["id", "date_of_inquiry", "status"],
        required: false,
      },
      {
        model: User,
        as: "callByUser",
        attributes: ["id", "name", "email"],
        required: false,
      },
    ],
    transaction,
  });

  return updatedFollowup.toJSON();
};

const deleteFollowup = async (id, transaction = null) => {
  const models = getTenantModels();
  const { Followup } = models;
  const followup = await Followup.findOne({
    where: { id, deleted_at: null },
    transaction,
  });

  if (!followup) {
    throw new AppError("Followup not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  await followup.destroy({ transaction });
  return true;
};

const getFollowupById = async (id, transaction = null) => {
  const models = getTenantModels();
  const { Followup, Inquiry, User } = models;
  const followup = await Followup.findOne({
    where: { id, deleted_at: null },
    include: [
      {
        model: Inquiry,
        as: "inquiry",
        attributes: ["id", "date_of_inquiry", "status"],
        required: false,
      },
      {
        model: User,
        as: "callByUser",
        attributes: ["id", "name", "email"],
        required: false,
      },
    ],
    transaction,
  });

  if (!followup) {
    throw new AppError("Followup not found", RESPONSE_STATUS_CODES.NOT_FOUND);
  }

  return followup.toJSON();
};

const listFollowups = async ({ page = 1, limit = 20, q = null, ...filters } = {}, transaction = null) => {
  const models = getTenantModels();
  const { Followup, Inquiry, User } = models;
  const followupWhere = { deleted_at: null };
  let inquiryWhere = { deleted_at: null };

  // Handle search query (q) - search in followup remarks and inquiry fields
  if (q) {
    const inquirySearchConditions = [
      { status: { [Op.iLike]: `%${q}%` } },
      { remarks: { [Op.iLike]: `%${q}%` } },
    ];

    // If q is a number, also search by followup ID or inquiry ID
    const numericQ = parseInt(q, 10);
    if (!isNaN(numericQ)) {
      // Search by followup ID
      followupWhere[Op.or] = [
        { id: numericQ },
        { remarks: { [Op.iLike]: `%${q}%` } }
      ];
      // Search by inquiry ID
      inquirySearchConditions.push({ id: numericQ });
    } else {
      // Search in followup remarks
      followupWhere[Op.or] = [
        { remarks: { [Op.iLike]: `%${q}%` } }
      ];
    }

    // Search in inquiry fields
    inquiryWhere[Op.or] = inquirySearchConditions;
  }

  // Filter by inquiry_id if provided
  if (filters.inquiry_id != null && filters.inquiry_id !== "") {
    const numericId = parseInt(filters.inquiry_id, 10);
    if (!Number.isNaN(numericId)) {
      followupWhere.inquiry_id = numericId;
    }
  }

  // Filter by followup remarks
  if (filters.followup_remarks) {
    followupWhere.remarks = { [Op.iLike]: `%${filters.followup_remarks}%` };
  }

  // Filter by followup next_reminder date range
  if (filters.followup_next_reminder_from || filters.followup_next_reminder_to) {
    followupWhere.next_reminder = followupWhere.next_reminder || {};
    if (filters.followup_next_reminder_from) followupWhere.next_reminder[Op.gte] = filters.followup_next_reminder_from;
    if (filters.followup_next_reminder_to) followupWhere.next_reminder[Op.lte] = filters.followup_next_reminder_to;
    if (Reflect.ownKeys(followupWhere.next_reminder).length === 0) delete followupWhere.next_reminder;
  }

  // Filter by followup created_at date range
  if (filters.followup_created_at_from || filters.followup_created_at_to) {
    followupWhere.created_at = followupWhere.created_at || {};
    if (filters.followup_created_at_from) followupWhere.created_at[Op.gte] = filters.followup_created_at_from;
    if (filters.followup_created_at_to) followupWhere.created_at[Op.lte] = filters.followup_created_at_to;
    if (Reflect.ownKeys(followupWhere.created_at).length === 0) delete followupWhere.created_at;
  }

  // Filter by inquiry status (from Inquiry). Always exclude Converted inquiries from followup list.
  if (filters.status) {
    inquiryWhere.status = filters.status === "Converted" ? "__NO_MATCH__" : filters.status;
  } else {
    inquiryWhere.status = { [Op.ne]: "Converted" };
  }

  // Filter by inquiry date_of_inquiry range
  if (filters.date_of_inquiry_from || filters.date_of_inquiry_to) {
    inquiryWhere.date_of_inquiry = inquiryWhere.date_of_inquiry || {};
    if (filters.date_of_inquiry_from) inquiryWhere.date_of_inquiry[Op.gte] = filters.date_of_inquiry_from;
    if (filters.date_of_inquiry_to) inquiryWhere.date_of_inquiry[Op.lte] = filters.date_of_inquiry_to;
    if (Reflect.ownKeys(inquiryWhere.date_of_inquiry).length === 0) delete inquiryWhere.date_of_inquiry;
  }

  // Filter by inquiry capacity (number)
  if (filters.capacity || filters.capacity_to) {
    const cap = parseFloat(filters.capacity);
    const capTo = parseFloat(filters.capacity_to);
    if (!Number.isNaN(cap) || !Number.isNaN(capTo)) {
      const cond = {};
      const opStr = (filters.capacity_op || "").toLowerCase();
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

  // Note: We don't apply search at database level for inquiries when q is provided
  // because we need to search across both inquiry and followup fields after flattening.
  // This ensures we can find inquiries that match via their followups even if the inquiry itself doesn't match.

  // We also don't apply search to followup fields at database level
  // because the separate query might not work correctly with search conditions.
  // Instead, we'll do comprehensive search after flattening the results.

  // Filter by inquiry_status (from followup) if provided
  if (filters.inquiry_status) {
    followupWhere.inquiry_status = filters.inquiry_status;
  }

  // Filter by call_by if provided
  if (filters.call_by) {
    followupWhere.call_by = filters.call_by;
  }

  // Filter by is_schedule_site_visit if provided
  if (filters.is_schedule_site_visit !== undefined) {
    followupWhere.is_schedule_site_visit = filters.is_schedule_site_visit;
  }

  // Filter by is_msg_send_to_customer if provided
  if (filters.is_msg_send_to_customer !== undefined) {
    followupWhere.is_msg_send_to_customer = filters.is_msg_send_to_customer;
  }

  // Build the inquiry include configuration
  const inquiryInclude = {
    model: Inquiry,
    as: "inquiry",
    required: true, // INNER JOIN - only include followups with valid inquiries
    where: Object.keys(inquiryWhere).length > 1 ? inquiryWhere : undefined, // Only add if more than just deleted_at
    attributes: [
      "id",
      "inquiry_number",
      "date_of_inquiry",
      "status",
      "capacity",
      "estimated_cost",
      "channel_partner",
      "remarks",
    ],
  };

  // Build the callByUser include configuration
  const callByUserInclude = {
    model: User,
    as: "callByUser",
    attributes: ["id", "name", "email"],
    required: false,
  };

  // Build count query options
  const countOptions = {
    where: followupWhere,
    include: [
      {
        model: Inquiry,
        as: "inquiry",
        required: true,
        where: Object.keys(inquiryWhere).length > 1 ? inquiryWhere : undefined, // Only add if more than just deleted_at
      },
    ],
    transaction,
  };

  // Get total count for pagination
  const total = await Followup.count(countOptions);

  // Apply sorting
  const sortByField = filters.sortBy || "id";
  const sortOrderDir = (filters.sortOrder || "DESC").toUpperCase();
  let orderClause = [["id", "DESC"]];
  if (sortByField) {
    if (["date_of_inquiry", "status", "capacity", "estimated_cost"].includes(sortByField)) {
      orderClause = [[{ model: Inquiry, as: "inquiry" }, sortByField, sortOrderDir]];
    } else if (["remarks", "next_reminder", "created_at", "inquiry_status", "id"].includes(sortByField)) {
      orderClause = [[sortByField, sortOrderDir]];
    }
  }

  // Get paginated followups
  const offset = (page - 1) * limit;
  const followups = await Followup.findAll({
    where: followupWhere,
    include: [inquiryInclude, callByUserInclude],
    order: orderClause,
    limit: parseInt(limit),
    offset: offset,
    transaction,
  });

  // Transform the data: flatten followup with inquiry details
  const allResults = followups.map((followup) => {
    const followupData = followup.toJSON();
    const inquiry = followupData.inquiry || {};

    // Build result object with inquiry details at root level
    const result = {
      // Followup fields
      followup_id: followupData.id,
      followup_status: followupData.inquiry_status || "",
      followup_remarks: followupData.remarks || "",
      followup_next_reminder: followupData.next_reminder || null,
      followup_call_by: followupData.call_by || null,
      followup_created_at: followupData.created_at || null,
      followup_is_schedule_site_visit: followupData.is_schedule_site_visit || false,
      followup_is_msg_send_to_customer: followupData.is_msg_send_to_customer || false,
      followup_call_by_user: followupData.callByUser || null,

      // Inquiry fields (flattened to root level)
      id: inquiry.id || null,
      inquiry_number: inquiry.inquiry_number || null,
      date_of_inquiry: inquiry.date_of_inquiry || null,
      status: inquiry.status || null,
      capacity: inquiry.capacity || null,
      estimated_cost: inquiry.estimated_cost || null,
      channel_partner: inquiry.channel_partner || null,
      inquiry_remarks: inquiry.remarks || null,
    };

    return result;
  });

  return {
    data: allResults,
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: total,
      pages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  };
};

const exportFollowups = async ({ page = 1, limit = 10000, q = null, ...filters } = {}, transaction = null) => {
  const { data } = await listFollowups({ page, limit, q, ...filters }, transaction);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Followups");
  worksheet.columns = [
    { header: "Inquiry ID", key: "id", width: 12 },
    { header: "Date of Inquiry", key: "date_of_inquiry", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Followup Status", key: "followup_status", width: 16 },
    { header: "Capacity", key: "capacity", width: 10 },
    { header: "Estimated Cost", key: "estimated_cost", width: 14 },
    { header: "Remarks", key: "followup_remarks", width: 28 },
    { header: "Created At", key: "followup_created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
  (data || []).forEach((r) => {
    worksheet.addRow({
      id: r.id ?? "",
      date_of_inquiry: r.date_of_inquiry ? new Date(r.date_of_inquiry).toISOString().split("T")[0] : "",
      status: r.status ?? "",
      followup_status: r.followup_status ?? "",
      capacity: r.capacity ?? "",
      estimated_cost: r.estimated_cost ?? "",
      followup_remarks: r.followup_remarks ?? "",
      followup_created_at: r.followup_created_at ? new Date(r.followup_created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

const getRatingOptions = async () => {
  // Return rating options from constants
  return FOLLOWUP_RATING.map((rating) => ({
    id: rating,
    value: rating,
    label: rating.toString(),
  }));
};

const getInquiry = async () => {
  const models = getTenantModels();
  const { Inquiry } = models;
  // get all inquiry from table
  const inquiry = await Inquiry.findAll({
    where: {
      deleted_at: null,
    },
  });
  return inquiry;
};

module.exports = {
  createFollowup,
  updateFollowup,
  deleteFollowup,
  getFollowupById,
  listFollowups,
  exportFollowups,
  getRatingOptions,
  getInquiry
};

