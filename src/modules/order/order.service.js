"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { Op } = require("sequelize");

const {
    Order,
    Inquiry,
    Quotation,
    Customer,
    User,
    InquirySource,
    CompanyBranch,
    ProjectScheme,
    OrderType,
    Discom,
    Division,
    SubDivision,
    LoanType,
    State,
    City,
    Product,
    ProjectPhase,
} = db;

const listOrders = async ({
    page = 1,
    limit = 20,
    search = null,
    status = "pending",
    sortBy = "created_at",
    sortOrder = "DESC",
    order_number,
    order_date_from,
    order_date_to,
    customer_name,
    capacity,
    capacity_op,
    capacity_to,
    project_cost,
    project_cost_op,
    project_cost_to,
} = {}) => {
    const offset = (page - 1) * limit;

    const where = { deleted_at: null };

    if (status) {
        where.status = status;
    }

    if (order_number) {
        where.order_number = { [Op.iLike]: `%${order_number}%` };
    }

    if (order_date_from || order_date_to) {
        where.order_date = where.order_date || {};
        if (order_date_from) where.order_date[Op.gte] = order_date_from;
        if (order_date_to) where.order_date[Op.lte] = order_date_to;
        if (Reflect.ownKeys(where.order_date).length === 0) delete where.order_date;
    }

    if (capacity || capacity_to) {
        const cap = parseFloat(capacity);
        const capTo = parseFloat(capacity_to);
        if (!Number.isNaN(cap) || !Number.isNaN(capTo)) {
            const cond = {};
            const opStr = (capacity_op || "").toLowerCase();
            if (opStr === "between" && !Number.isNaN(cap) && !Number.isNaN(capTo)) cond[Op.between] = [cap, capTo];
            else if (opStr === "gt" && !Number.isNaN(cap)) cond[Op.gt] = cap;
            else if (opStr === "lt" && !Number.isNaN(cap)) cond[Op.lt] = cap;
            else if (opStr === "gte" && !Number.isNaN(cap)) cond[Op.gte] = cap;
            else if (opStr === "lte" && !Number.isNaN(cap)) cond[Op.lte] = cap;
            else if (!Number.isNaN(cap)) cond[Op.eq] = cap;
            if (Reflect.ownKeys(cond).length > 0) where.capacity = cond;
        }
    }

    if (project_cost || project_cost_to) {
        const cost = parseFloat(project_cost);
        const costTo = parseFloat(project_cost_to);
        if (!Number.isNaN(cost) || !Number.isNaN(costTo)) {
            const cond = {};
            const opStr = (project_cost_op || "").toLowerCase();
            if (opStr === "between" && !Number.isNaN(cost) && !Number.isNaN(costTo)) cond[Op.between] = [cost, costTo];
            else if (opStr === "gt" && !Number.isNaN(cost)) cond[Op.gt] = cost;
            else if (opStr === "lt" && !Number.isNaN(cost)) cond[Op.lt] = cost;
            else if (opStr === "gte" && !Number.isNaN(cost)) cond[Op.gte] = cost;
            else if (opStr === "lte" && !Number.isNaN(cost)) cond[Op.lte] = cost;
            else if (!Number.isNaN(cost)) cond[Op.eq] = cost;
            if (Reflect.ownKeys(cond).length > 0) where.project_cost = cond;
        }
    }

    if (search) {
        const searchOr = {
            [Op.or]: [
                { order_number: { [Op.iLike]: `%${search}%` } },
                { consumer_no: { [Op.iLike]: `%${search}%` } },
                { reference_from: { [Op.iLike]: `%${search}%` } },
                { application_no: { [Op.iLike]: `%${search}%` } },
                { guvnl_no: { [Op.iLike]: `%${search}%` } },
            ],
        };
        where[Op.and] = where[Op.and] ? [...where[Op.and], searchOr] : [searchOr];
    }

    const customerWhere = customer_name ? { customer_name: { [Op.iLike]: `%${customer_name}%` } } : undefined;
    const customerInclude = {
        model: Customer,
        as: "customer",
        required: !!customer_name,
        where: customerWhere,
        include: [
            { model: State, as: "state", attributes: ["id", "name"] },
            { model: City, as: "city", attributes: ["id", "name"] },
        ],
    };

    const includeList = [
        { model: Inquiry, as: "inquiry", attributes: ["id", "inquiry_number"] },
        { model: Quotation, as: "quotation", attributes: ["id", "quotation_number"] },
        customerInclude,
        { model: User, as: "inquiryBy", attributes: ["id", "name"], required: false },
        { model: User, as: "handledBy", attributes: ["id", "name"], required: false },
        { model: User, as: "channelPartner", attributes: ["id", "name"], required: false },
        { model: InquirySource, as: "inquirySource", attributes: ["id", "source_name"], required: false },
        { model: CompanyBranch, as: "branch", attributes: ["id", "name"], required: false },
        { model: ProjectScheme, as: "projectScheme", attributes: ["id", "name"], required: false },
        { model: OrderType, as: "orderType", attributes: ["id", "name"], required: false },
        { model: Discom, as: "discom", attributes: ["id", "name"], required: false },
        { model: Division, as: "division", attributes: ["id", "name"], required: false },
        { model: SubDivision, as: "subDivision", attributes: ["id", "name"], required: false },
        { model: LoanType, as: "loanType", attributes: ["id", "type_name"], required: false },
        { model: Product, as: "solarPanel", attributes: ["id", "product_name"], required: false },
        { model: Product, as: "inverter", attributes: ["id", "product_name"], required: false },
        { model: ProjectPhase, as: "projectPhase", attributes: ["id", "name"], required: false },
    ];

    const { count, rows } = await Order.findAndCountAll({
        where,
        attributes: {
            include: [
                [
                    db.sequelize.literal(`(
                        SELECT COALESCE(SUM(payment_amount), 0)
                        FROM order_payment_details
                        WHERE order_payment_details.order_id = "Order".id
                          AND order_payment_details.deleted_at IS NULL
                    )`),
                    'total_paid'
                ]
            ]
        },
        include: includeList,
        order: [[sortBy, sortOrder]],
        limit,
        offset,
        distinct: true,
    });

    const data = rows.map((order) => {
        const row = order.toJSON();
        return {
            id: row.id,
            pui_number: row.order_number, // PUI is order_number
            order_number: row.order_number,
            status: row.status,
            order_date: row.order_date,
            capacity: row.capacity,
            project_cost: row.project_cost,
            discount: row.discount,

            // Reference numbers
            inquiry_number: row.inquiry?.inquiry_number || null,
            quotation_number: row.quotation?.quotation_number || null,

            // Customer details
            customer_name: row.customer?.customer_name || null,
            mobile_number: row.customer?.mobile_number || null,
            company_name: row.customer?.company_name || null,
            phone_no: row.customer?.phone_no || null,
            payment_received: row.total_paid || 0,
            total_paid: row.total_paid || 0,
            address: row.customer?.address || null,

            // Assignment details
            inquiry_by_name: row.inquiryBy?.name || null,
            handled_by_name: row.handledBy?.name || null,
            channel_partner_name: row.channelPartner?.name || null,

            // Source and branch
            inquiry_source_name: row.inquirySource?.source_name || null,
            branch_name: row.branch?.name || null,

            // Scheme and type
            project_scheme_name: row.projectScheme?.name || null,
            order_type_name: row.orderType?.name || null,

            // Discom details
            discom_name: row.discom?.name || null,
            division_name: row.division?.name || null,
            sub_division_name: row.subDivision?.name || null,
            consumer_no: row.consumer_no,

            // Loan and products
            loan_type_name: row.loanType?.type_name || null,
            solar_panel_name: row.solarPanel?.product_name || null,
            inverter_name: row.inverter?.product_name || null,

            // State from customer
            state_name: row.customer?.state?.name || null,
            city_name: row.customer?.city?.name || null,

            // Other fields
            reference_from: row.reference_from || null,
            project_phase_name: row.projectPhase?.name || null,
            order_remarks: row.order_remarks || null,
            application_no: row.application_no || null,
            date_of_registration_gov: row.date_of_registration_gov || null,
            payment_type: row.payment_type || null,
            estimate_due_date: row.estimate_due_date || null,
            estimate_paid_at: row.estimate_paid_at || null,
            estimate_paid_by: row.estimate_paid_by || null,

            // Pipeline tracking
            stages: row.stages || {},
            current_stage_key: row.current_stage_key || null,

            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    });

    return {
        data,
        meta: {
            page,
            limit,
            total: count,
            pages: limit > 0 ? Math.ceil(count / limit) : 0,
        },
    };
};

const exportOrders = async (params = {}) => {
    const { data } = await listOrders({ ...params, page: 1, limit: 10000 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Orders");
    worksheet.columns = [
        { header: "Order #", key: "order_number", width: 18 },
        { header: "Status", key: "status", width: 14 },
        { header: "Date", key: "order_date", width: 12 },
        { header: "Customer", key: "customer_name", width: 24 },
        { header: "Mobile", key: "mobile_number", width: 14 },
        { header: "Capacity", key: "capacity", width: 12 },
        { header: "Project Cost", key: "project_cost", width: 14 },
        { header: "Inquiry #", key: "inquiry_number", width: 16 },
        { header: "Quotation #", key: "quotation_number", width: 16 },
        { header: "Created At", key: "created_at", width: 22 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    (data || []).forEach((o) => {
        worksheet.addRow({
            order_number: o.order_number || o.pui_number || "",
            status: o.status || "",
            order_date: o.order_date ? new Date(o.order_date).toISOString().split("T")[0] : "",
            customer_name: o.customer_name || "",
            mobile_number: o.mobile_number || "",
            capacity: o.capacity != null ? o.capacity : "",
            project_cost: o.project_cost != null ? o.project_cost : "",
            inquiry_number: o.inquiry_number || "",
            quotation_number: o.quotation_number || "",
            created_at: o.created_at ? new Date(o.created_at).toISOString() : "",
        });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
};

const getOrderById = async ({ id } = {}) => {
    if (!id) return null;

    const order = await Order.findOne({
        where: { id, deleted_at: null },
        include: [
            { model: Inquiry, as: "inquiry", attributes: ["id", "inquiry_number"] },
            { model: Quotation, as: "quotation", attributes: ["id", "quotation_number"] },
            {
                model: Customer,
                as: "customer",
                include: [
                    { model: State, as: "state", attributes: ["id", "name"] },
                    { model: City, as: "city", attributes: ["id", "name"] },
                ],
            },
            { model: User, as: "inquiryBy", attributes: ["id", "name"], required: false },
            { model: User, as: "handledBy", attributes: ["id", "name"], required: false },
            { model: User, as: "channelPartner", attributes: ["id", "name"], required: false },
            { model: InquirySource, as: "inquirySource", attributes: ["id", "source_name"], required: false },
            { model: CompanyBranch, as: "branch", attributes: ["id", "name"], required: false },
            { model: ProjectScheme, as: "projectScheme", attributes: ["id", "name"], required: false },
            { model: OrderType, as: "orderType", attributes: ["id", "name"], required: false },
            { model: Discom, as: "discom", attributes: ["id", "name"], required: false },
            { model: Division, as: "division", attributes: ["id", "name"], required: false },
            { model: SubDivision, as: "subDivision", attributes: ["id", "name"], required: false },
            { model: LoanType, as: "loanType", attributes: ["id", "type_name"], required: false },
            { model: Product, as: "solarPanel", attributes: ["id", "product_name", "product_description", "barcode_number"], required: false },
            { model: Product, as: "inverter", attributes: ["id", "product_name", "product_description", "barcode_number"], required: false },
            { model: ProjectPhase, as: "projectPhase", attributes: ["id", "name"], required: false },
        ],
    });

    if (!order) return null;

    const row = order.toJSON();
    return {
        id: row.id,
        order_number: row.order_number,
        status: row.status,
        inquiry_id: row.inquiry_id,
        quotation_id: row.quotation_id,
        inquiry_source_id: row.inquiry_source_id,
        inquiry_by: row.inquiry_by,
        handled_by: row.handled_by,
        reference_from: row.reference_from,
        order_date: row.order_date,
        branch_id: row.branch_id,
        channel_partner_id: row.channel_partner_id,
        project_scheme_id: row.project_scheme_id,
        capacity: row.capacity,
        existing_pv_capacity: row.existing_pv_capacity,
        project_cost: row.project_cost,
        discount: row.discount,
        order_type_id: row.order_type_id,
        customer_id: row.customer_id,
        discom_id: row.discom_id,
        consumer_no: row.consumer_no,
        division_id: row.division_id,
        sub_division_id: row.sub_division_id,
        circle: row.circle,
        demand_load: row.demand_load,
        date_of_registration_gov: row.date_of_registration_gov,
        application_no: row.application_no,
        guvnl_no: row.guvnl_no,
        feasibility_date: row.feasibility_date,
        geda_registration_date: row.geda_registration_date,
        payment_type: row.payment_type,
        loan_type_id: row.loan_type_id,
        solar_panel_id: row.solar_panel_id,
        inverter_id: row.inverter_id,
        project_phase_id: row.project_phase_id,
        order_remarks: row.order_remarks,
        // Related data
        inquiry_number: row.inquiry?.inquiry_number || null,
        quotation_number: row.quotation?.quotation_number || null,
        inquiry_by_name: row.inquiryBy?.name || null,
        handled_by_name: row.handledBy?.name || null,
        channel_partner_name: row.channelPartner?.name || null,
        inquiry_source_name: row.inquirySource?.source_name || null,
        branch_name: row.branch?.name || null,
        project_scheme_name: row.projectScheme?.name || null,
        order_type_name: row.orderType?.name || null,
        discom_name: row.discom?.name || null,
        division_name: row.division?.name || null,
        sub_division_name: row.subDivision?.name || null,
        loan_type_name: row.loanType?.type_name || null,
        solar_panel_name: row.solarPanel?.product_name || null,
        solar_panel_code: row.solarPanel?.barcode_number || null,
        solar_panel_description: row.solarPanel?.product_description || row.solarPanel?.product_name || null,
        inverter_name: row.inverter?.product_name || null,
        inverter_code: row.inverter?.barcode_number || null,
        inverter_description: row.inverter?.product_description || row.inverter?.product_name || null,
        project_phase_name: row.projectPhase?.name || null,
        // Customer details
        customer_name: row.customer?.customer_name || null,
        mobile_number: row.customer?.mobile_number || null,
        company_name: row.customer?.company_name || null,
        phone_no: row.customer?.phone_no || null,
        email_id: row.customer?.email_id || null,
        pin_code: row.customer?.pin_code || null,
        state_id: row.customer?.state_id || null,
        state_name: row.customer?.state?.name || null,
        city_id: row.customer?.city_id || null,
        city_name: row.customer?.city?.name || null,
        address: row.customer?.address || null,
        landmark_area: row.customer?.landmark_area || null,

        // Pipeline tracking
        stages: row.stages,
        current_stage_key: row.current_stage_key,

        // Stage 1: Estimate Generated
        estimate_quotation_serial_no: row.estimate_quotation_serial_no,
        estimate_amount: row.estimate_amount,
        estimate_due_date: row.estimate_due_date,
        estimate_completed_at: row.estimate_completed_at,
        estimate_paid_at: row.estimate_paid_at,
        estimate_paid_by: row.estimate_paid_by,

        // Stage 3: Planner
        planned_delivery_date: row.planned_delivery_date,
        planned_priority: row.planned_priority,
        planned_warehouse_id: row.planned_warehouse_id,
        planned_remarks: row.planned_remarks,
        planned_solar_panel_qty: row.planned_solar_panel_qty,
        planned_inverter_qty: row.planned_inverter_qty,
        planned_has_structure: row.planned_has_structure,
        planned_has_solar_panel: row.planned_has_solar_panel,
        planned_has_inverter: row.planned_has_inverter,
        planned_has_acdb: row.planned_has_acdb,
        planned_has_dcdb: row.planned_has_dcdb,
        planned_has_earthing_kit: row.planned_has_earthing_kit,
        planned_has_cables: row.planned_has_cables,
        planner_completed_at: row.planner_completed_at,

        // Stage 5: Fabrication
        fabricator_installer_are_same: row.fabricator_installer_are_same,
        fabricator_installer_id: row.fabricator_installer_id,
        fabricator_id: row.fabricator_id,
        installer_id: row.installer_id,
        fabrication_due_date: row.fabrication_due_date,
        installation_due_date: row.installation_due_date,
        fabrication_remarks: row.fabrication_remarks,
        fabrication_completed_at: row.fabrication_completed_at,

        // Stage 6: Installation
        installation_completed_at: row.installation_completed_at,

        // Stage 7: Netmeter Apply
        netmeter_applied: row.netmeter_applied,
        netmeter_applied_on: row.netmeter_applied_on,
        netmeter_apply_remarks: row.netmeter_apply_remarks,
        netmeter_apply_completed_at: row.netmeter_apply_completed_at,

        // Stage 8: Netmeter Installed
        netmeter_installed: row.netmeter_installed,
        netmeter_serial_no: row.netmeter_serial_no,
        solarmeter_serial_no: row.solarmeter_serial_no,
        generation: row.generation,
        netmeter_installed_on: row.netmeter_installed_on,
        netmeter_installed_remarks: row.netmeter_installed_remarks,
        generate_service: row.generate_service,
        service_visit_scheduled_on: row.service_visit_scheduled_on,
        service_assign_to: row.service_assign_to,
        netmeter_installed_completed_at: row.netmeter_installed_completed_at,

        // Stage 9: Subsidy Claim
        subsidy_claim: row.subsidy_claim,
        claim_date: row.claim_date,
        claim_no: row.claim_no,
        claim_amount: row.claim_amount,
        state_subsidy_claim: row.state_subsidy_claim,
        state_claim_date: row.state_claim_date,
        state_claim_amount: row.state_claim_amount,
        state_claim_no: row.state_claim_no,
        subsidy_claim_remarks: row.subsidy_claim_remarks,
        subsidy_claim_completed_at: row.subsidy_claim_completed_at,

        // Stage 10: Subsidy Disbursed
        subsidy_disbursed: row.subsidy_disbursed,
        disbursed_date: row.disbursed_date,
        disbursed_amount: row.disbursed_amount,
        subsidy_disbursed_remarks: row.subsidy_disbursed_remarks,
        state_disbursed: row.state_disbursed,
        state_disbursed_date: row.state_disbursed_date,
        state_disbursed_amount: row.state_disbursed_amount,
        subsidy_disbursed_completed_at: row.subsidy_disbursed_completed_at,

        created_at: row.created_at,
        updated_at: row.updated_at,
    };
};

const createOrder = async ({ payload, transaction } = {}) => {
    const t = transaction || (await db.sequelize.transaction());
    let committedHere = !transaction;

    try {
        // 1) Create or use existing customer
        let customerId = payload.customer_id;

        if (!customerId) {
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

            const customer = await db.Customer.create(customerPayload, { transaction: t });
            customerId = customer.id;
        }

        // 2) Create Order
        const orderData = {
            status: payload.status || "pending",
            inquiry_id: payload.inquiry_id || null,
            quotation_id: payload.quotation_id || null,
            inquiry_source_id: payload.inquiry_source_id,
            inquiry_by: payload.inquiry_by,
            handled_by: payload.handled_by,
            reference_from: payload.reference_from || null,
            order_date: payload.order_date,
            branch_id: payload.branch_id,
            channel_partner_id: payload.channel_partner_id || null,
            project_scheme_id: payload.project_scheme_id,
            capacity: payload.capacity,
            existing_pv_capacity: payload.existing_pv_capacity || null,
            project_cost: payload.project_cost,
            discount: payload.discount || 0,
            order_type_id: payload.order_type_id,
            customer_id: customerId,
            discom_id: payload.discom_id,
            consumer_no: payload.consumer_no,
            division_id: payload.division_id || null,
            sub_division_id: payload.sub_division_id || null,
            circle: payload.circle || null,
            demand_load: payload.demand_load || null,
            date_of_registration_gov: payload.date_of_registration_gov || null,
            application_no: payload.application_no || null,
            guvnl_no: payload.guvnl_no || null,
            feasibility_date: payload.feasibility_date || null,
            geda_registration_date: payload.geda_registration_date || null,
            payment_type: payload.payment_type || null,
            loan_type_id: payload.loan_type_id || null,
            solar_panel_id: payload.solar_panel_id || null,
            inverter_id: payload.inverter_id || null,
            project_phase_id: payload.project_phase_id || null,
        };

        const created = await Order.create(orderData, { transaction: t });

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

const updateOrder = async ({ id, payload, transaction } = {}) => {
    if (!id) return null;

    const t = transaction || (await db.sequelize.transaction());
    let committedHere = !transaction;

    try {
        const order = await Order.findOne({
            where: { id, deleted_at: null },
            transaction: t,
        });

        if (!order) throw new Error("Order not found");

        // Auto-transition order to completed when final stage is completed.
        // Rule: if Subsidy Disbursed stage is completed AND subsidy_disbursed is true, close the order.
        // Safety: only auto-close confirmed orders.
        const stagesPayload = payload?.stages || null;
        const isFinalStageMarkedCompleted =
            stagesPayload?.subsidy_disbursed === "completed" || !!payload?.subsidy_disbursed_completed_at;
        const shouldAutoComplete =
            order.status === "confirmed" && isFinalStageMarkedCompleted && payload?.subsidy_disbursed === true;
        const effectiveStatus = shouldAutoComplete ? "completed" : (payload?.status ?? order.status);

        // Update linked customer if present
        if (order.customer_id) {
            const customer = await db.Customer.findOne({
                where: { id: order.customer_id, deleted_at: null },
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

        await order.update(
            {
                status: effectiveStatus,
                inquiry_id: payload.inquiry_id ?? order.inquiry_id,
                quotation_id: payload.quotation_id ?? order.quotation_id,
                inquiry_source_id: payload.inquiry_source_id ?? order.inquiry_source_id,
                inquiry_by: payload.inquiry_by ?? order.inquiry_by,
                handled_by: payload.handled_by ?? order.handled_by,
                reference_from: payload.reference_from ?? order.reference_from,
                order_date: payload.order_date ?? order.order_date,
                branch_id: payload.branch_id ?? order.branch_id,
                channel_partner_id: payload.channel_partner_id ?? order.channel_partner_id,
                project_scheme_id: payload.project_scheme_id ?? order.project_scheme_id,
                capacity: payload.capacity ?? order.capacity,
                existing_pv_capacity: payload.existing_pv_capacity ?? order.existing_pv_capacity,
                project_cost: payload.project_cost ?? order.project_cost,
                discount: payload.discount ?? order.discount,
                order_type_id: payload.order_type_id ?? order.order_type_id,
                discom_id: payload.discom_id ?? order.discom_id,
                consumer_no: payload.consumer_no ?? order.consumer_no,
                division_id: payload.division_id ?? order.division_id,
                sub_division_id: payload.sub_division_id ?? order.sub_division_id,
                circle: payload.circle ?? order.circle,
                demand_load: payload.demand_load ?? order.demand_load,
                date_of_registration_gov: payload.date_of_registration_gov ?? order.date_of_registration_gov,
                application_no: payload.application_no ?? order.application_no,
                guvnl_no: payload.guvnl_no ?? order.guvnl_no,
                feasibility_date: payload.feasibility_date ?? order.feasibility_date,
                geda_registration_date: payload.geda_registration_date ?? order.geda_registration_date,
                payment_type: payload.payment_type ?? order.payment_type,
                loan_type_id: payload.loan_type_id ?? order.loan_type_id,
                solar_panel_id: payload.solar_panel_id ?? order.solar_panel_id,
                inverter_id: payload.inverter_id ?? order.inverter_id,
                project_phase_id: payload.project_phase_id ?? order.project_phase_id,
                order_remarks: payload.order_remarks ?? order.order_remarks,

                // Pipeline fields
                stages: payload.stages ?? order.stages,
                current_stage_key: payload.current_stage_key ?? order.current_stage_key,

                // Stage 1: Estimate Generated
                estimate_quotation_serial_no: payload.estimate_quotation_serial_no ?? order.estimate_quotation_serial_no,
                estimate_amount: payload.estimate_amount ?? order.estimate_amount,
                estimate_due_date: payload.estimate_due_date ?? order.estimate_due_date,
                estimate_completed_at: payload.estimate_completed_at ?? order.estimate_completed_at,
                estimate_paid_at: payload.estimate_paid_at ?? order.estimate_paid_at,
                estimate_paid_by: payload.estimate_paid_by ?? order.estimate_paid_by,
                zero_amount_estimate: payload.zero_amount_estimate ?? order.zero_amount_estimate,

                // Stage 3: Planner
                planned_delivery_date: payload.planned_delivery_date ?? order.planned_delivery_date,
                planned_priority: payload.planned_priority ?? order.planned_priority,
                planned_warehouse_id: payload.planned_warehouse_id ?? order.planned_warehouse_id,
                planned_remarks: payload.planned_remarks ?? order.planned_remarks,
                planned_solar_panel_qty: payload.planned_solar_panel_qty ?? order.planned_solar_panel_qty,
                planned_inverter_qty: payload.planned_inverter_qty ?? order.planned_inverter_qty,
                planned_has_structure: payload.planned_has_structure ?? order.planned_has_structure,
                planned_has_solar_panel: payload.planned_has_solar_panel ?? order.planned_has_solar_panel,
                planned_has_inverter: payload.planned_has_inverter ?? order.planned_has_inverter,
                planned_has_acdb: payload.planned_has_acdb ?? order.planned_has_acdb,
                planned_has_dcdb: payload.planned_has_dcdb ?? order.planned_has_dcdb,
                planned_has_earthing_kit: payload.planned_has_earthing_kit ?? order.planned_has_earthing_kit,
                planned_has_cables: payload.planned_has_cables ?? order.planned_has_cables,
                planner_completed_at: payload.planner_completed_at ?? order.planner_completed_at,

                // Stage 5: Fabrication
                fabricator_installer_are_same: payload.fabricator_installer_are_same ?? order.fabricator_installer_are_same,
                fabricator_installer_id: payload.fabricator_installer_id ?? order.fabricator_installer_id,
                fabricator_id: payload.fabricator_id ?? order.fabricator_id,
                installer_id: payload.installer_id ?? order.installer_id,
                fabrication_due_date: payload.fabrication_due_date ?? order.fabrication_due_date,
                installation_due_date: payload.installation_due_date ?? order.installation_due_date,
                fabrication_remarks: payload.fabrication_remarks ?? order.fabrication_remarks,
                fabrication_completed_at: payload.fabrication_completed_at ?? order.fabrication_completed_at,

                // Stage 6: Installation
                installation_completed_at: payload.installation_completed_at ?? order.installation_completed_at,

                // Stage 7: Netmeter Apply
                netmeter_applied: payload.netmeter_applied ?? order.netmeter_applied,
                netmeter_applied_on: payload.netmeter_applied_on ?? order.netmeter_applied_on,
                netmeter_apply_remarks: payload.netmeter_apply_remarks ?? order.netmeter_apply_remarks,
                netmeter_apply_completed_at: payload.netmeter_apply_completed_at ?? order.netmeter_apply_completed_at,

                // Stage 8: Netmeter Installed
                netmeter_installed: payload.netmeter_installed ?? order.netmeter_installed,
                netmeter_serial_no: payload.netmeter_serial_no ?? order.netmeter_serial_no,
                solarmeter_serial_no: payload.solarmeter_serial_no ?? order.solarmeter_serial_no,
                generation: payload.generation ?? order.generation,
                netmeter_installed_on: payload.netmeter_installed_on ?? order.netmeter_installed_on,
                netmeter_installed_remarks: payload.netmeter_installed_remarks ?? order.netmeter_installed_remarks,
                generate_service: payload.generate_service ?? order.generate_service,
                service_visit_scheduled_on: payload.service_visit_scheduled_on ?? order.service_visit_scheduled_on,
                service_assign_to: payload.service_assign_to ?? order.service_assign_to,
                netmeter_installed_completed_at: payload.netmeter_installed_completed_at ?? order.netmeter_installed_completed_at,

                // Stage 9: Subsidy Claim
                subsidy_claim: payload.subsidy_claim ?? order.subsidy_claim,
                claim_date: payload.claim_date ?? order.claim_date,
                claim_no: payload.claim_no ?? order.claim_no,
                claim_amount: payload.claim_amount ?? order.claim_amount,
                state_subsidy_claim: payload.state_subsidy_claim ?? order.state_subsidy_claim,
                state_claim_date: payload.state_claim_date ?? order.state_claim_date,
                state_claim_amount: payload.state_claim_amount ?? order.state_claim_amount,
                state_claim_no: payload.state_claim_no ?? order.state_claim_no,
                subsidy_claim_remarks: payload.subsidy_claim_remarks ?? order.subsidy_claim_remarks,
                subsidy_claim_completed_at: payload.subsidy_claim_completed_at ?? order.subsidy_claim_completed_at,

                // Stage 10: Subsidy Disbursed
                subsidy_disbursed: payload.subsidy_disbursed ?? order.subsidy_disbursed,
                disbursed_date: payload.disbursed_date ?? order.disbursed_date,
                disbursed_amount: payload.disbursed_amount ?? order.disbursed_amount,
                subsidy_disbursed_remarks: payload.subsidy_disbursed_remarks ?? order.subsidy_disbursed_remarks,
                state_disbursed: payload.state_disbursed ?? order.state_disbursed,
                state_disbursed_date: payload.state_disbursed_date ?? order.state_disbursed_date,
                state_disbursed_amount: payload.state_disbursed_amount ?? order.state_disbursed_amount,
                subsidy_disbursed_completed_at: payload.subsidy_disbursed_completed_at ?? order.subsidy_disbursed_completed_at,
            },
            { transaction: t }
        );

        if (committedHere) {
            await t.commit();
        }

        return order.toJSON();
    } catch (err) {
        if (committedHere) {
            await t.rollback();
        }
        throw err;
    }
};

const deleteOrder = async ({ id, transaction } = {}) => {
    if (!id) return false;

    const t = transaction || (await db.sequelize.transaction());
    let committedHere = !transaction;

    try {
        const order = await Order.findOne({
            where: { id, deleted_at: null },
            transaction: t,
        });

        if (!order) throw new Error("Order not found");

        // Soft delete
        await order.destroy({ transaction: t });

        if (committedHere) {
            await t.commit();
        }

        return true;
    } catch (err) {
        if (committedHere) {
            await t.rollback();
        }
        throw err;
    }
};

const getSolarPanels = async () => {
    const products = await Product.findAll({
        where: {
            product_type_id: 10,
            deleted_at: null,
            is_active: true
        },
        order: [['product_name', 'ASC']]
    });

    return products.map(p => ({
        id: p.id,
        label: p.product_name,
        value: p.id,
        ...p.toJSON()
    }));
};

const getInverters = async () => {
    const products = await Product.findAll({
        where: {
            product_type_id: 9,
            deleted_at: null,
            is_active: true
        },
        order: [['product_name', 'ASC']]
    });

    return products.map(p => ({
        id: p.id,
        label: p.product_name,
        value: p.id,
        ...p.toJSON()
    }));
};

module.exports = {
    listOrders,
    exportOrders,
    getOrderById,
    createOrder,
    updateOrder,
    deleteOrder,
    getSolarPanels,
    getInverters,
};
