"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { getTenantModels } = require("../tenant/tenantModels.js");
const { INQUIRY_STATUS } = require("../../common/utils/constants.js");

const listInquiries = async ({
  search,
  is_dead,
  page = 1,
  limit = 20,
  sortBy = "id",
  sortOrder = "DESC",
  inquiry_number: inquiryNumber,
  status,
  customer_name: customerName,
  date_of_inquiry_from: dateOfInquiryFrom,
  date_of_inquiry_to: dateOfInquiryTo,
  project_scheme: projectScheme,
  capacity,
  capacity_op: capacityOp,
  capacity_to: capacityTo,
  mobile_number: mobileNumber,
  address,
  landmark_area: landmarkArea,
  city_name: cityName,
  state_name: stateName,
  pin_code: pinCode,
  discom_name: discomName,
  inquiry_source: inquirySource,
  order_type: orderType,
  reference_from: referenceFrom,
  company_name: companyName,
  remarks,
  branch_name: branchName,
  handled_by: handledBy,
  inquiry_by: inquiryBy,
  channel_partner: channelPartner,
  created_at_from: createdAtFrom,
  created_at_to: createdAtTo,
  created_at_op: createdAtOp,
  next_reminder_date_from: nextReminderDateFrom,
  next_reminder_date_to: nextReminderDateTo,
  next_reminder_date_op: nextReminderDateOp,
  assigned_on_from: assignedOnFrom,
  assigned_on_to: assignedOnTo,
  assigned_on_op: assignedOnOp,
  enforced_handled_by_ids: enforcedHandledByIds,
} = {}) => {
  const models = getTenantModels();
  const { Inquiry, InquirySource, ProjectScheme, User, Customer, CompanyBranch, Discom, State, City, OrderType } = models;
  const { Op } = models.Sequelize;

  const where = { deleted_at: null };
  if (is_dead === 'true' || is_dead === true) {
    where.is_dead = true;
  } else {
    where.is_dead = false;
  }

  if (inquiryNumber) {
    where.inquiry_number = { [Op.iLike]: `%${inquiryNumber}%` };
  }
  if (status) {
    where.status = status;
  } else {
    where.status = { [Op.ne]: INQUIRY_STATUS.CONVERTED };
  }
  if (referenceFrom) {
    where.reference_from = { [Op.iLike]: `%${referenceFrom}%` };
  }
  if (remarks) {
    where.remarks = { [Op.iLike]: `%${remarks}%` };
  }
  if (capacity || capacityTo) {
    const cap = parseFloat(capacity);
    const capTo = parseFloat(capacityTo);
    if (!Number.isNaN(cap) || !Number.isNaN(capTo)) {
      const cond = {};
      const opStr = (capacityOp || "").toLowerCase();
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
      if (Reflect.ownKeys(cond).length > 0) where.capacity = cond;
    }
  }
  const inquiryFrom = dateOfInquiryFrom || assignedOnFrom;
  const inquiryTo = dateOfInquiryTo || assignedOnTo;
  if (inquiryFrom || inquiryTo) {
    where.date_of_inquiry = where.date_of_inquiry || {};
    if (inquiryFrom) where.date_of_inquiry[Op.gte] = inquiryFrom;
    if (inquiryTo) where.date_of_inquiry[Op.lte] = inquiryTo;
    if (Reflect.ownKeys(where.date_of_inquiry).length === 0) delete where.date_of_inquiry;
  }
  if (createdAtFrom || createdAtTo) {
    where.created_at = where.created_at || {};
    if (createdAtFrom) where.created_at[Op.gte] = createdAtFrom;
    if (createdAtTo) where.created_at[Op.lte] = createdAtTo;
    if (Reflect.ownKeys(where.created_at).length === 0) delete where.created_at;
  }
  if (nextReminderDateFrom || nextReminderDateTo) {
    where.next_reminder_date = where.next_reminder_date || {};
    if (nextReminderDateFrom) where.next_reminder_date[Op.gte] = nextReminderDateFrom;
    if (nextReminderDateTo) where.next_reminder_date[Op.lte] = nextReminderDateTo;
    if (Reflect.ownKeys(where.next_reminder_date).length === 0) delete where.next_reminder_date;
  }
  if (Array.isArray(enforcedHandledByIds)) {
    if (enforcedHandledByIds.length === 0) {
      where.handled_by = { [Op.in]: [-1] };
    } else {
      where.handled_by = { [Op.in]: enforcedHandledByIds };
    }
  }

  if (search) {
    where[Op.or] = [
      { inquiry_number: { [Op.iLike]: `%${search}%` } },
      { reference_from: { [Op.iLike]: `%${search}%` } },
      { remarks: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const customerWhere = {};
  if (customerName) customerWhere.customer_name = { [Op.iLike]: `%${customerName}%` };
  if (mobileNumber) customerWhere.mobile_number = { [Op.iLike]: `%${mobileNumber}%` };
  if (address) customerWhere.address = { [Op.iLike]: `%${address}%` };
  if (landmarkArea) customerWhere.landmark_area = { [Op.iLike]: `%${landmarkArea}%` };
  if (companyName) customerWhere.company_name = { [Op.iLike]: `%${companyName}%` };
  if (pinCode) customerWhere.pin_code = { [Op.iLike]: `%${pinCode}%` };

  const cityWhere = cityName ? { name: { [Op.iLike]: `%${cityName}%` } } : undefined;
  const stateWhere = stateName ? { name: { [Op.iLike]: `%${stateName}%` } } : undefined;
  const hasCustomerFilter = Object.keys(customerWhere).length > 0 || cityName || stateName;

  const customerInclude = {
    model: Customer,
    as: "customer",
    required: hasCustomerFilter,
    where: Object.keys(customerWhere).length > 0 ? customerWhere : undefined,
    include: [
      { model: State, as: "state", attributes: ["id", "name"], ...(stateName ? { required: true, where: stateWhere } : {}) },
      { model: City, as: "city", attributes: ["id", "name"], ...(cityName ? { required: true, where: cityWhere } : {}) },
    ],
  };

  const inquirySourceInclude = {
    model: InquirySource,
    as: "inquirySource",
    attributes: ["id", "source_name"],
    required: !!inquirySource,
    where: inquirySource ? { source_name: { [Op.iLike]: `%${inquirySource}%` } } : undefined,
  };
  const projectSchemeInclude = {
    model: ProjectScheme,
    as: "projectScheme",
    attributes: ["id", "name"],
    required: !!projectScheme,
    where: projectScheme ? { name: { [Op.iLike]: `%${projectScheme}%` } } : undefined,
  };
  const inquiryByInclude = {
    model: User,
    as: "inquiryBy",
    attributes: ["id", "name"],
    required: !!inquiryBy,
    where: inquiryBy ? { name: { [Op.iLike]: `%${inquiryBy}%` } } : undefined,
  };
  const handledByInclude = {
    model: User,
    as: "handledBy",
    attributes: ["id", "name"],
    required: !!handledBy,
    where: handledBy ? { name: { [Op.iLike]: `%${handledBy}%` } } : undefined,
  };
  const channelPartnerInclude = {
    model: User,
    as: "channelPartner",
    attributes: ["id", "name"],
    required: !!channelPartner,
    where: channelPartner ? { name: { [Op.iLike]: `%${channelPartner}%` } } : undefined,
  };
  const branchInclude = {
    model: CompanyBranch,
    as: "branch",
    attributes: ["id", "name"],
    required: !!branchName,
    where: branchName ? { name: { [Op.iLike]: `%${branchName}%` } } : undefined,
  };
  const discomInclude = {
    model: Discom,
    as: "discom",
    attributes: ["id", "name"],
    required: !!discomName,
    where: discomName ? { name: { [Op.iLike]: `%${discomName}%` } } : undefined,
  };
  const orderTypeInclude = {
    model: OrderType,
    as: "orderType",
    attributes: ["id", "name"],
    required: !!orderType,
    where: orderType ? { name: { [Op.iLike]: `%${orderType}%` } } : undefined,
  };

  const finalInclude = [
    inquirySourceInclude.required ? inquirySourceInclude : { model: InquirySource, as: "inquirySource", attributes: ["id", "source_name"] },
    projectSchemeInclude.required ? projectSchemeInclude : { model: ProjectScheme, as: "projectScheme", attributes: ["id", "name"] },
    inquiryByInclude.required ? inquiryByInclude : { model: User, as: "inquiryBy", attributes: ["id", "name"] },
    handledByInclude.required ? handledByInclude : { model: User, as: "handledBy", attributes: ["id", "name"] },
    channelPartnerInclude.required ? channelPartnerInclude : { model: User, as: "channelPartner", attributes: ["id", "name"] },
    branchInclude.required ? branchInclude : { model: CompanyBranch, as: "branch", attributes: ["id", "name"] },
    discomInclude.required ? discomInclude : { model: Discom, as: "discom", attributes: ["id", "name"] },
    orderTypeInclude.required ? orderTypeInclude : { model: OrderType, as: "orderType", attributes: ["id", "name"] },
    customerInclude,
  ];

  const offset = (page - 1) * limit;
  const orderClause =
    sortBy === "customer_name"
      ? [[{ model: Customer, as: "customer" }, "customer_name", sortOrder]]
      : [[sortBy || "id", sortOrder]];

  const { count, rows } = await Inquiry.findAndCountAll({
    where,
    include: finalInclude,
    order: orderClause,
    limit: limit || undefined,
    offset: limit ? offset : undefined,
    distinct: true,
  });

  const data = rows.map((it) => {
    const row = it.toJSON();
    return {
      id: row.id,
      inquiry_number: row.inquiry_number,
      inquiry_source_id: row.inquiry_source_id,
      status: row.status,
      capacity: row.capacity,
      inquiry_source: row.inquirySource?.source_name || null,
      project_scheme: row.projectScheme?.name || null,
      inquiry_by: row.inquiryBy?.name || null,
      handled_by: row.handledBy?.name || null,
      channel_partner: row.channelPartner?.name || null,
      customer_name: row.customer?.customer_name || null,
      mobile_number: row.customer?.mobile_number || null,
      phone_no: row.customer?.phone_no || null,
      company_name: row.customer?.company_name || null,
      address: row.customer?.address || null,
      landmark_area: row.customer?.landmark_area || null,
      city_name: row.customer?.city?.name || null,
      state_name: row.customer?.state?.name || null,
      pin_code: row.customer?.pin_code || null,
      discom_name: row.discom?.name || null,
      order_type: row.orderType?.name || null,
      rating: row.rating || null,
      reference_from: row.reference_from || null,
      remarks: row.remarks || null,
      date_of_inquiry: row.date_of_inquiry,
      assigned_on: row.date_of_inquiry,
      next_reminder_date: row.next_reminder_date,
      created_at: row.created_at,
      branch_name: row.branch?.name || null,
      branch_id: row.branch_id ?? row.branch?.id ?? null,
      email_id: row.customer?.email_id || null,
      state_id: row.customer?.state_id || null,
      city_id: row.customer?.city_id || null,
      order_type_id: row.orderType?.id || null,
      project_scheme_id: row.projectScheme?.id || null,
    };
  });

  if (page && limit) {
    return {
      data,
      meta: { page, limit, total: count, pages: limit > 0 ? Math.ceil(count / limit) : 0 },
    };
  }
  return data;
};

const exportInquiries = async ({
  search,
  is_dead,
  inquiry_number,
  status,
  customer_name,
  date_of_inquiry_from,
  date_of_inquiry_to,
  project_scheme,
  capacity,
  capacity_op,
  capacity_to,
  mobile_number,
  address,
  landmark_area,
  city_name,
  state_name,
  pin_code,
  discom_name,
  inquiry_source,
  order_type,
  reference_from,
  company_name,
  remarks,
  branch_name,
  handled_by,
  inquiry_by,
  channel_partner,
  created_at_from,
  created_at_to,
  created_at_op,
  next_reminder_date_from,
  next_reminder_date_to,
  next_reminder_date_op,
  assigned_on_from,
  assigned_on_to,
  assigned_on_op,
  enforced_handled_by_ids,
} = {}) => {
  const result = await listInquiries({
    search,
    is_dead,
    page: 1,
    limit: 10000,
    inquiry_number,
    status,
    customer_name,
    date_of_inquiry_from,
    date_of_inquiry_to,
    project_scheme,
    capacity,
    capacity_op,
    capacity_to,
    mobile_number,
    address,
    landmark_area,
    city_name,
    state_name,
    pin_code,
    discom_name,
    inquiry_source,
    order_type,
    reference_from,
    company_name,
    remarks,
    branch_name,
    handled_by,
    inquiry_by,
    channel_partner,
    created_at_from,
    created_at_to,
    created_at_op,
    next_reminder_date_from,
    next_reminder_date_to,
    next_reminder_date_op,
    assigned_on_from,
    assigned_on_to,
    assigned_on_op,
    enforced_handled_by_ids,
  });
  const data = Array.isArray(result) ? result : result?.data || [];

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Inquiries");
  worksheet.columns = [
    { header: "Inquiry #", key: "inquiry_number", width: 16 },
    { header: "Date", key: "date_of_inquiry", width: 12 },
    { header: "Customer", key: "customer_name", width: 24 },
    { header: "Mobile", key: "mobile_number", width: 14 },
    { header: "Source", key: "inquiry_source", width: 16 },
    { header: "Status", key: "status", width: 14 },
    { header: "Capacity", key: "capacity", width: 12 },
    { header: "Reference", key: "reference_from", width: 18 },
    { header: "Created At", key: "created_at", width: 22 },
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
  (data || []).forEach((i) => {
    worksheet.addRow({
      inquiry_number: i.inquiry_number || "",
      date_of_inquiry: i.date_of_inquiry ? new Date(i.date_of_inquiry).toISOString().split("T")[0] : "",
      customer_name: i.customer_name || "",
      mobile_number: i.mobile_number || "",
      inquiry_source: i.inquiry_source || "",
      status: i.status || "",
      capacity: i.capacity ?? "",
      reference_from: i.reference_from || "",
      created_at: i.created_at ? new Date(i.created_at).toISOString() : "",
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

const getInquiryById = async ({ id }) => {
  const models = getTenantModels();
  const { Inquiry, InquirySource, ProjectScheme, User, Customer, CompanyBranch, Discom, State, City } = models;
  if (!id) return null;

  const found = await Inquiry.findOne({
    where: { id, deleted_at: null },
    include: [
      { model: InquirySource, as: "inquirySource", attributes: ["id", "source_name"] },
      { model: ProjectScheme, as: "projectScheme", attributes: ["id", "name"] },
      { model: User, as: "inquiryBy", attributes: ["id", "name"] },
      { model: User, as: "handledBy", attributes: ["id", "name"] },
      { model: User, as: "channelPartner", attributes: ["id", "name"] },
      { model: CompanyBranch, as: "branch", attributes: ["id", "name"] },
      { model: Discom, as: "discom", attributes: ["id", "name"] },
      {
        model: Customer,
        as: "customer",
        include: [
          { model: State, as: "state", attributes: ["id", "name"] },
          { model: City, as: "city", attributes: ["id", "name"] }
        ]
      },
    ],
  });

  if (!found) return null;
  const row = found.toJSON();

  return {
    id: row.id,
    inquiry_number: row.inquiry_number,
    inquiry_source_id: row.inquiry_source_id,
    inquiry_source: row.inquirySource?.source_name || null,
    status: row.status,
    date_of_inquiry: row.date_of_inquiry,
    inquiry_by: row.inquiry_by,
    inquiry_by_name: row.inquiryBy?.name || null,
    handled_by: row.handled_by,
    handled_by_name: row.handledBy?.name || null,
    channel_partner: row.channel_partner,
    channel_partner_name: row.channelPartner?.name || null,
    branch_id: row.branch_id,
    branch_name: row.branch?.name || null,
    project_scheme_id: row.project_scheme_id,
    project_scheme: row.projectScheme?.name || null,
    capacity: row.capacity,
    order_type: row.order_type,
    discom_id: row.discom_id,
    discom_name: row.discom?.name || null,
    rating: row.rating,
    remarks: row.remarks,
    next_reminder_date: row.next_reminder_date,
    reference_from: row.reference_from,
    estimated_cost: row.estimated_cost,
    payment_type: row.payment_type,
    do_not_send_message: row.do_not_send_message,
    created_at: row.created_at,
    // Customer fields
    customer_id: row.customer_id,
    customer_name: row.customer?.customer_name || "",
    mobile_number: row.customer?.mobile_number || "",
    company_name: row.customer?.company_name || "",
    phone_no: row.customer?.phone_no || "",
    email_id: row.customer?.email_id || "",
    pin_code: row.customer?.pin_code || "",
    state_id: row.customer?.state_id || null,
    state_name: row.customer?.state?.name || null,
    city_id: row.customer?.city_id || null,
    city_name: row.customer?.city?.name || null,
    address: row.customer?.address || "",
    landmark_area: row.customer?.landmark_area || "",
    taluka: row.customer?.taluka || "",
    district: row.customer?.district || "",
  };
};

const createInquiry = async ({ payload, transaction } = {}) => {
  const models = getTenantModels();
  const { Inquiry, Customer, CompanyBranch, Company } = models;

  const t = transaction || (await models.sequelize.transaction());
  let committedHere = !transaction;

  try {
    // 1) Create Customer from payload
    const customerPayload = {
      customer_name: payload.customer_name || null,
      mobile_number: payload.mobile_number || null,
      company_name: payload.company_name || null,
      phone_no: payload.phone_no || null,
      email_id: payload.email_id || null,
      pin_code: payload.pin_code || null,
      state_id: payload.state_id || null,
      city_id: payload.city_id || null,
      address: payload.address || null,
      landmark_area: payload.landmark_area || null,
      taluka: payload.taluka || null,
      district: payload.district || null,
    };

    const customer = await Customer.create(customerPayload, { transaction: t });

    // 2) Determine branch_id - use provided branch_id or default branch
    let branchId = payload.branch_id || null;
    if (!branchId) {
      // Get company first
      const company = await Company.findOne({
        where: { deleted_at: null },
        order: [["created_at", "DESC"]],
        transaction: t,
      });

      if (company) {
        // Get default branch
        const defaultBranch = await CompanyBranch.findOne({
          where: {
            company_id: company.id,
            deleted_at: null,
            is_default: true,
            is_active: true,
          },
          transaction: t,
        });

        if (defaultBranch) {
          branchId = defaultBranch.id;
        }
      }
    }

    // 3) Create Inquiry linked to that customer
    const data = {
      inquiry_source_id: payload.inquiry_source_id || null,
      customer_id: customer.id,
      date_of_inquiry: payload.date_of_inquiry || null,
      inquiry_by: payload.inquiry_by || null,
      handled_by: payload.handled_by || null,
      channel_partner: payload.channel_partner || null,
      branch_id: branchId,
      project_scheme_id: payload.project_scheme_id || null,
      capacity: payload.capacity ?? 0,
      order_type: payload.order_type || null,
      discom_id: payload.discom_id || null,
      rating: payload.rating || null,
      remarks: payload.remarks || null,
      next_reminder_date: payload.next_reminder_date || null,
      reference_from: payload.reference_from || null,
      estimated_cost: payload.estimated_cost || null,
      payment_type: payload.payment_type || null,
      do_not_send_message: !!payload.do_not_send_message,
    };

    const created = await Inquiry.create(data, { transaction: t });

    if (committedHere) {
      await t.commit();
    }

    return created.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

const updateInquiry = async ({ id, payload, transaction } = {}) => {
  const models = getTenantModels();
  const { Inquiry, Customer } = models;
  if (!id) return null;

  const t = transaction || (await models.sequelize.transaction());
  let committedHere = !transaction;

  try {
    const inquiry = await Inquiry.findOne({
      where: { id, deleted_at: null },
      transaction: t,
    });
    if (!inquiry) throw new Error("Inquiry not found");

    // Update linked customer if present
    if (inquiry.customer_id) {
      const customer = await Customer.findOne({
        where: { id: inquiry.customer_id, deleted_at: null },
        transaction: t,
      });
      if (customer) {
        await customer.update(
          {
            customer_name: payload.customer_name ?? customer.customer_name,
            mobile_number: payload.mobile_number ?? customer.mobile_number,
            company_name: payload.company_name ?? customer.company_name,
            phone_no: payload.phone_no ?? customer.phone_no,
            email_id: payload.email_id ?? customer.email_id,
            pin_code: payload.pin_code ?? customer.pin_code,
            state_id: payload.state_id ?? customer.state_id,
            city_id: payload.city_id ?? customer.city_id,
            address: payload.address ?? customer.address,
            landmark_area: payload.landmark_area ?? customer.landmark_area,
            taluka: payload.taluka ?? customer.taluka,
            district: payload.district ?? customer.district,
          },
          { transaction: t }
        );
      }
    }

    await inquiry.update(
      {
        inquiry_source_id: payload.inquiry_source_id ?? inquiry.inquiry_source_id,
        date_of_inquiry: payload.date_of_inquiry ?? inquiry.date_of_inquiry,
        inquiry_by: payload.inquiry_by ?? inquiry.inquiry_by,
        handled_by: payload.handled_by ?? inquiry.handled_by,
        channel_partner: payload.channel_partner ?? inquiry.channel_partner,
        branch_id: payload.branch_id ?? inquiry.branch_id,
        project_scheme_id: payload.project_scheme_id ?? inquiry.project_scheme_id,
        capacity:
          payload.capacity === undefined || payload.capacity === null
            ? inquiry.capacity
            : payload.capacity,
        order_type: payload.order_type ?? inquiry.order_type,
        discom_id: payload.discom_id ?? inquiry.discom_id,
        rating: payload.rating ?? inquiry.rating,
        remarks: payload.remarks ?? inquiry.remarks,
        next_reminder_date: payload.next_reminder_date ?? inquiry.next_reminder_date,
        reference_from: payload.reference_from ?? inquiry.reference_from,
        estimated_cost:
          payload.estimated_cost === undefined || payload.estimated_cost === null
            ? inquiry.estimated_cost
            : payload.estimated_cost,
        payment_type: payload.payment_type ?? inquiry.payment_type,
        do_not_send_message:
          payload.do_not_send_message === undefined
            ? inquiry.do_not_send_message
            : !!payload.do_not_send_message,
        status: payload.status ?? inquiry.status,
        is_dead: payload.is_dead ?? inquiry.is_dead,
      },
      { transaction: t }
    );

    if (committedHere) {
      await t.commit();
    }

    return inquiry.toJSON();
  } catch (err) {
    if (committedHere) {
      await t.rollback();
    }
    throw err;
  }
};

// --- Inquiry CSV Import ---
const INQUIRY_IMPORT_CSV_HEADERS = [
  "Customer Name",
  "Mobile Number",
  "Company Name",
  "Phone No",
  "Email Id",
  "Address",
  "Landmark/Area",
  "Pin Code",
  "State Name",
  "City Name",
  "Date of Inquiry",
  "Inquiry Source",
  "Branch",
  "Project Scheme",
  "Capacity (kW)",
  "Order Type",
  "Discom",
  "Remarks",
  "Reference From",
  "Next Reminder Date",
  "Rating",
  "Payment Type",
  "Do Not Send Message",
];

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else if (c !== "\r") {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, "").trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]).map((v) => v.replace(/^"|"$/g, "").trim());
    if (values.some((v) => v.length > 0)) rows.push(values);
  }
  return { headers, rows };
}

function escapeCSVField(val) {
  if (val == null) return "";
  const s = String(val).trim();
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const generateInquiryImportSampleCsv = () => {
  const headerRow = INQUIRY_IMPORT_CSV_HEADERS.map(escapeCSVField).join(",");
  const row1 = [
    "Sample Customer 1",
    "9876543210",
    "Acme Ltd",
    "",
    "sample1@example.com",
    "123 Main St",
    "Near Park",
    "400001",
    "Maharashtra",
    "Mumbai",
    "2025-02-01",
    "Website",
    "Main",
    "National Portal",
    "3",
    "Rooftop",
    "MSEDCL",
    "Sample remarks",
    "Referral",
    "2025-02-15",
    "Good",
    "Cash",
    "false",
  ]
    .map(escapeCSVField)
    .join(",");
  const row2 = [
    "Sample Customer 2",
    "9123456789",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "2025-02-02",
    "Walk-in",
    "Main",
    "National Portal",
    "5",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "false",
  ]
    .map(escapeCSVField)
    .join(",");
  const csv = [headerRow, row1, row2].join("\n");
  return { filename: "inquiry-import-sample.csv", csv };
};

const bulkImportInquiriesFromCsv = async ({ csvText, filename } = {}) => {
  const models = getTenantModels();
  const { InquirySource, ProjectScheme, CompanyBranch, OrderType, Discom, State, City, Inquiry, Customer } = models;
  const { Op } = models.Sequelize;

  const { headers, rows } = parseCSV(csvText || "");
  if (headers.length === 0 || rows.length === 0) {
    return { inserted: 0, failed: 1, total: 0, errors: [{ row: 0, message: "No data rows in file" }] };
  }

  const headerIndex = {};
  INQUIRY_IMPORT_CSV_HEADERS.forEach((h, i) => {
    const idx = headers.findIndex((x) => x.trim().toLowerCase() === h.trim().toLowerCase());
    if (idx >= 0) headerIndex[h] = idx;
  });

  const get = (row, colName) => {
    const idx = headerIndex[colName];
    if (idx == null || idx >= row.length) return "";
    return (row[idx] || "").trim();
  };

  const errors = [];
  let inserted = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rowNum = r + 2;

    const customerName = get(row, "Customer Name");
    const mobileNumber = get(row, "Mobile Number");
    const dateOfInquiry = get(row, "Date of Inquiry");

    if (!customerName || !mobileNumber || !dateOfInquiry) {
      errors.push({
        row: rowNum,
        message: "Customer Name, Mobile Number and Date of Inquiry are required",
      });
      continue;
    }

    const dateStr = dateOfInquiry;
    const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      errors.push({ row: rowNum, message: "Date of Inquiry must be YYYY-MM-DD" });
      continue;
    }

    let stateId = null;
    let cityId = null;
    const stateName = get(row, "State Name");
    const cityName = get(row, "City Name");
    if (stateName) {
      const state = await State.findOne({
        where: { name: { [Op.iLike]: stateName }, deleted_at: null },
        attributes: ["id"],
      });
      if (state) stateId = state.id;
    }
    if (cityName) {
      const cityWhere = { name: { [Op.iLike]: cityName }, deleted_at: null };
      if (stateId) cityWhere.state_id = stateId;
      const city = await City.findOne({ where: cityWhere, attributes: ["id"] });
      if (city) cityId = city.id;
    }

    let inquirySourceId = null;
    const inquirySourceName = get(row, "Inquiry Source");
    if (inquirySourceName) {
      const src = await InquirySource.findOne({
        where: { source_name: { [Op.iLike]: inquirySourceName }, deleted_at: null },
        attributes: ["id"],
      });
      if (src) inquirySourceId = src.id;
    }

    let branchId = null;
    const branchName = get(row, "Branch");
    if (branchName) {
      const branch = await CompanyBranch.findOne({
        where: { name: { [Op.iLike]: branchName }, deleted_at: null },
        attributes: ["id"],
      });
      if (branch) branchId = branch.id;
    }

    let projectSchemeId = null;
    const projectSchemeName = get(row, "Project Scheme");
    if (projectSchemeName) {
      const ps = await ProjectScheme.findOne({
        where: { name: { [Op.iLike]: projectSchemeName }, deleted_at: null },
        attributes: ["id"],
      });
      if (ps) projectSchemeId = ps.id;
    }

    let orderTypeId = null;
    const orderTypeName = get(row, "Order Type");
    if (orderTypeName) {
      const ot = await OrderType.findOne({
        where: { name: { [Op.iLike]: orderTypeName }, deleted_at: null },
        attributes: ["id"],
      });
      if (ot) orderTypeId = ot.id;
    }

    let discomId = null;
    const discomName = get(row, "Discom");
    if (discomName) {
      const d = await Discom.findOne({
        where: { name: { [Op.iLike]: discomName }, deleted_at: null },
        attributes: ["id"],
      });
      if (d) discomId = d.id;
    }

    const capacityStr = get(row, "Capacity (kW)");
    const capacity = capacityStr ? parseFloat(capacityStr) : 0;
    const doNotSendStr = (get(row, "Do Not Send Message") || "").toLowerCase();
    const doNotSendMessage =
      doNotSendStr === "true" || doNotSendStr === "1" || doNotSendStr === "yes";

    const payload = {
      customer_name: customerName,
      mobile_number: mobileNumber,
      company_name: get(row, "Company Name") || null,
      phone_no: get(row, "Phone No") || null,
      email_id: get(row, "Email Id") || null,
      address: get(row, "Address") || null,
      landmark_area: get(row, "Landmark/Area") || null,
      pin_code: get(row, "Pin Code") || null,
      state_id: stateId,
      city_id: cityId,
      date_of_inquiry: dateOfInquiry,
      inquiry_source_id: inquirySourceId,
      branch_id: branchId,
      project_scheme_id: projectSchemeId,
      capacity: Number.isNaN(capacity) ? 0 : capacity,
      order_type: orderTypeId,
      discom_id: discomId,
      remarks: get(row, "Remarks") || null,
      reference_from: get(row, "Reference From") || null,
      next_reminder_date: get(row, "Next Reminder Date") || null,
      rating: get(row, "Rating") || null,
      payment_type: get(row, "Payment Type") || null,
      do_not_send_message: doNotSendMessage,
    };

    try {
      await createInquiry({ payload });
      inserted++;
    } catch (err) {
      errors.push({
        row: rowNum,
        message: err.message || String(err),
      });
    }
  }

  const total = rows.length;
  const failed = errors.length;
  return { inserted, failed, total, errors };
};

module.exports = {
  listInquiries,
  exportInquiries,
  getInquiryById,
  createInquiry,
  updateInquiry,
  generateInquiryImportSampleCsv,
  bulkImportInquiriesFromCsv,
};


