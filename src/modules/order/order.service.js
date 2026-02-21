"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { Op } = require("sequelize");
const { INQUIRY_STATUS, QUOTATION_STATUS } = require("../../common/utils/constants.js");
const { getBomLineProduct } = require("../../common/utils/bomUtils.js");
const { getTenantModels } = require("../tenant/tenantModels.js");

/** Derive first panel and first inverter product_id from bom_snapshot (by product_type_name). */
const derivePanelAndInverterFromBomSnapshot = (bom_snapshot) => {
    const out = { solar_panel_id: null, inverter_id: null };
    if (!bom_snapshot || !Array.isArray(bom_snapshot)) return out;
    const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, "_");
    for (const line of bom_snapshot) {
        const product = getBomLineProduct(line);
        const typeName = norm(product?.product_type_name || "");
        if (typeName === "panel" && out.solar_panel_id == null) out.solar_panel_id = line.product_id;
        if (typeName === "inverter" && out.inverter_id == null) out.inverter_id = line.product_id;
        if (out.solar_panel_id != null && out.inverter_id != null) break;
    }
    return out;
};

/** Normalize order bom_snapshot for API: ensure shipped_qty, returned_qty, pending_qty, planned_qty, delivered_qty on each line (backward compat). */
const normalizeOrderBomSnapshot = (bom_snapshot) => {
    if (bom_snapshot == null || !Array.isArray(bom_snapshot)) return bom_snapshot;
    const qty = (n) => (n != null && !Number.isNaN(Number(n)) ? Number(n) : 0);
    return bom_snapshot.map((line) => {
        const quantity = qty(line.quantity);
        const shipped_qty = qty(line.shipped_qty);
        const returned_qty = qty(line.returned_qty);
        const planned_qty = line.planned_qty != null && !Number.isNaN(Number(line.planned_qty))
            ? Number(line.planned_qty)
            : quantity;
        const pending_qty = line.pending_qty != null && !Number.isNaN(Number(line.pending_qty))
            ? Number(line.pending_qty)
            : planned_qty - shipped_qty + returned_qty;
        return {
            ...line,
            shipped_qty,
            returned_qty,
            pending_qty,
            planned_qty,
            delivered_qty: shipped_qty,
        };
    });
};

const listOrders = async ({
    page = 1,
    limit = 20,
    search = null,
    status = "pending",
    sortBy = "id",
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
    enforced_handled_by_ids: enforcedHandledByIds,
} = {}) => {
    const models = getTenantModels();
    const {
        Order, Inquiry, Quotation, Customer, User, InquirySource, CompanyBranch,
        ProjectScheme, OrderType, Discom, Division, SubDivision, LoanType,
        State, City, Product, ProjectPhase, CompanyWarehouse, Fabrication, Installation,
    } = models;
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
    if (Array.isArray(enforcedHandledByIds)) {
        if (enforcedHandledByIds.length === 0) {
            where.handled_by = { [Op.in]: [-1] };
        } else {
            where.handled_by = { [Op.in]: enforcedHandledByIds };
        }
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
                    models.sequelize.literal(`(
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

            bom_snapshot: normalizeOrderBomSnapshot(row.bom_snapshot) ?? null,

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
    const models = getTenantModels();
    const {
        Order, Inquiry, Quotation, Customer, User, InquirySource, CompanyBranch,
        ProjectScheme, OrderType, Discom, Division, SubDivision, LoanType,
        State, City, Product, ProjectPhase, CompanyWarehouse, Fabrication, Installation,
    } = models;
    const order = await Order.findOne({
        where: { id, deleted_at: null },
        attributes: {
            include: [
                [
                    models.sequelize.literal(`(
                        SELECT COALESCE(SUM(payment_amount), 0)
                        FROM order_payment_details
                        WHERE order_payment_details.order_id = "Order".id
                          AND order_payment_details.deleted_at IS NULL
                    )`),
                    "total_paid",
                ],
            ],
        },
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
            { model: CompanyWarehouse, as: "plannedWarehouse", attributes: ["id", "name"], required: false },
            { model: Fabrication, as: "fabrication", required: false, include: [{ model: User, as: "fabricator", attributes: ["id", "name"], required: false }] },
            { model: Installation, as: "installation", required: false, include: [{ model: User, as: "installer", attributes: ["id", "name"], required: false }] },
        ],
    });

    if (!order) return null;

    const row = order.toJSON();
    const totalPaid = Number(row.total_paid) || 0;
    const projectCost = Number(row.project_cost) || 0;
    const discount = Number(row.discount) || 0;
    const payableCost = Math.max(projectCost - discount, 0);
    const outstandingBalance = Math.max(payableCost - totalPaid, 0);
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
        payable_cost: payableCost,
        total_paid: totalPaid,
        outstanding_balance: outstandingBalance,
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
        bom_snapshot: normalizeOrderBomSnapshot(row.bom_snapshot),
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
        planned_warehouse_name: row.plannedWarehouse?.name || null,
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

        // Stage 5: Assign Fabricator & Installer / Stage 6: Fabrication
        assign_fabricator_installer_completed_at: row.assign_fabricator_installer_completed_at,
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

        // Fabrication & Installation records (from separate tables)
        fabrication: row.fabrication ? {
            id: row.fabrication.id,
            order_id: row.fabrication.order_id,
            fabricator_id: row.fabrication.fabricator_id,
            fabricator_name: row.fabrication.fabricator?.name || null,
            fabrication_start_date: row.fabrication.fabrication_start_date,
            fabrication_end_date: row.fabrication.fabrication_end_date,
            structure_type: row.fabrication.structure_type,
            structure_material: row.fabrication.structure_material,
            coating_type: row.fabrication.coating_type,
            tilt_angle: row.fabrication.tilt_angle,
            height_from_roof: row.fabrication.height_from_roof,
            labour_category: row.fabrication.labour_category,
            labour_count: row.fabrication.labour_count,
            checklist: row.fabrication.checklist,
            images: row.fabrication.images,
            remarks: row.fabrication.remarks,
            completed_at: row.fabrication.completed_at,
            created_at: row.fabrication.created_at,
            updated_at: row.fabrication.updated_at,
        } : null,
        installation: row.installation ? {
            id: row.installation.id,
            order_id: row.installation.order_id,
            installer_id: row.installation.installer_id,
            installer_name: row.installation.installer?.name || null,
            installation_start_date: row.installation.installation_start_date,
            installation_end_date: row.installation.installation_end_date,
            inverter_installation_location: row.installation.inverter_installation_location,
            earthing_type: row.installation.earthing_type,
            wiring_type: row.installation.wiring_type,
            acdb_dcdb_make: row.installation.acdb_dcdb_make,
            panel_mounting_type: row.installation.panel_mounting_type,
            netmeter_readiness_status: row.installation.netmeter_readiness_status,
            total_panels_installed: row.installation.total_panels_installed,
            inverter_serial_no: row.installation.inverter_serial_no,
            panel_serial_numbers: row.installation.panel_serial_numbers,
            earthing_resistance: row.installation.earthing_resistance,
            initial_generation: row.installation.initial_generation,
            checklist: row.installation.checklist,
            images: row.installation.images,
            remarks: row.installation.remarks,
            completed_at: row.installation.completed_at,
            created_at: row.installation.created_at,
            updated_at: row.installation.updated_at,
        } : null,

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
    const models = getTenantModels();
    const {
        Order, Inquiry, Quotation, Customer, User, InquirySource, CompanyBranch,
        ProjectScheme, OrderType, Discom, Division, SubDivision, LoanType,
        State, City, Product, ProjectPhase, CompanyWarehouse, Fabrication, Installation,
    } = models;
    const t = transaction || (await models.sequelize.transaction());
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

            const customer = await Customer.create(customerPayload, { transaction: t });
            customerId = customer.id;
        }

        // Copy BOM snapshot from quotation when order is created from quote; add order qty tracking
        let bom_snapshot = null;
        let solar_panel_id = payload.solar_panel_id ?? null;
        let inverter_id = payload.inverter_id ?? null;
        let quotationForStatus = null;
        if (payload.quotation_id) {
            const quotation = await Quotation.findOne({
                where: { id: payload.quotation_id, deleted_at: null },
                attributes: ["id", "bom_snapshot", "inquiry_id"],
                transaction: t,
            });
            quotationForStatus = quotation;
            if (quotation && Array.isArray(quotation.bom_snapshot) && quotation.bom_snapshot.length > 0) {
                const raw = JSON.parse(JSON.stringify(quotation.bom_snapshot));
                const qty = (n) => (n != null && !Number.isNaN(Number(n)) ? Number(n) : 0);
                bom_snapshot = raw.map((line) => {
                    const quantity = qty(line.quantity);
                    return {
                        ...line,
                        shipped_qty: 0,
                        returned_qty: 0,
                        pending_qty: quantity,
                        planned_qty: quantity,
                        delivered_qty: 0,
                    };
                });
                const derived = derivePanelAndInverterFromBomSnapshot(quotation.bom_snapshot);
                if (derived.solar_panel_id != null) solar_panel_id = derived.solar_panel_id;
                if (derived.inverter_id != null) inverter_id = derived.inverter_id;
            }
        }

        // When order is from inquiry (direct or via quotation), carry forward inquiry_number as order_number
        let orderNumberFromInquiry = null;
        const inquiryIdForOrder = payload.inquiry_id || quotationForStatus?.inquiry_id;
        if (inquiryIdForOrder) {
            const inquiry = await Inquiry.findOne({
                where: { id: inquiryIdForOrder, deleted_at: null },
                attributes: ["inquiry_number"],
                transaction: t,
            });
            if (inquiry?.inquiry_number) {
                orderNumberFromInquiry = inquiry.inquiry_number;
            }
        }

        // 2) Create Order (allow order_number from payload for migration/import)
        const orderData = {
            ...(payload.order_number || orderNumberFromInquiry
                ? { order_number: payload.order_number || orderNumberFromInquiry }
                : {}),
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
            solar_panel_id,
            inverter_id,
            project_phase_id: payload.project_phase_id || null,
            bom_snapshot,
        };

        const created = await Order.create(orderData, { transaction: t });

        const statusOn = new Date().toISOString().slice(0, 10);
        if (payload.inquiry_id) {
            await Inquiry.update(
                { status: INQUIRY_STATUS.CONVERTED },
                { where: { id: payload.inquiry_id }, transaction: t }
            );
        }
        if (payload.quotation_id) {
            await Quotation.update(
                { status: QUOTATION_STATUS.CONVERTED, status_on: statusOn },
                { where: { id: payload.quotation_id }, transaction: t }
            );
            const inquiryId = quotationForStatus?.inquiry_id;
            if (inquiryId != null) {
                await Quotation.update(
                    { status: QUOTATION_STATUS.NOT_SELECTED, status_on: statusOn },
                    {
                        where: {
                            inquiry_id: inquiryId,
                            id: { [Op.ne]: payload.quotation_id },
                            deleted_at: null,
                        },
                        transaction: t,
                    }
                );
            }
        }

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
    const models = getTenantModels();
    const {
        Order, Inquiry, Quotation, Customer, User, InquirySource, CompanyBranch,
        ProjectScheme, OrderType, Discom, Division, SubDivision, LoanType,
        State, City, Product, ProjectPhase, CompanyWarehouse, Fabrication, Installation,
    } = models;
    const t = transaction || (await models.sequelize.transaction());
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
        const fabricatorInstallerAreSame =
            payload.fabricator_installer_are_same ?? order.fabricator_installer_are_same;
        const fabricatorInstallerId =
            payload.fabricator_installer_id ?? order.fabricator_installer_id;
        let fabricatorId = payload.fabricator_id ?? order.fabricator_id;
        let installerId = payload.installer_id ?? order.installer_id;

        if (fabricatorInstallerAreSame && fabricatorInstallerId != null) {
            fabricatorId = fabricatorInstallerId;
            installerId = fabricatorInstallerId;
        }

        // Update linked customer if present
        if (order.customer_id) {
            const customer = await Customer.findOne({
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

                // Allow updating normalized bom_snapshot from planner / other stages
                bom_snapshot: payload.bom_snapshot
                    ? normalizeOrderBomSnapshot(payload.bom_snapshot)
                    : order.bom_snapshot,

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

                // Stage 5: Assign Fabricator & Installer / Stage 6: Fabrication
                assign_fabricator_installer_completed_at: payload.assign_fabricator_installer_completed_at ?? order.assign_fabricator_installer_completed_at,
                fabricator_installer_are_same: fabricatorInstallerAreSame,
                fabricator_installer_id: fabricatorInstallerId,
                fabricator_id: fabricatorId,
                installer_id: installerId,
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
    const models = getTenantModels();
    const { Order } = models;
    const t = transaction || (await models.sequelize.transaction());
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

/**
 * List pending delivery orders for warehouse managers.
 * Rules:
 * - Order must belong to a warehouse managed by the current user
 * - Order must not be in a closed status (completed/cancelled)
 * - Order delivery_status must not be 'complete'
 */
const listPendingDeliveryOrders = async ({ user_id } = {}) => {
    if (!user_id) {
        return [];
    }
    const models = getTenantModels();
    const { Order, Customer, User, CompanyWarehouse } = models;
    // Find warehouses where the user is a manager
    const managedWarehouses = await CompanyWarehouse.findAll({
        include: [
            {
                model: User,
                as: "managers",
                attributes: [],
                required: true,
                where: { id: user_id },
            },
        ],
        attributes: ["id", "name"],
        where: { deleted_at: null },
    });

    const warehouseIds = managedWarehouses.map((w) => w.id);
    if (warehouseIds.length === 0) {
        return [];
    }

    const orders = await Order.findAll({
        where: {
            deleted_at: null,
            planned_warehouse_id: { [Op.in]: warehouseIds },
            status: { [Op.notIn]: ["completed", "cancelled"] },
        },
        attributes: [
            "id",
            "order_number",
            "customer_id",
            "order_date",
            "consumer_no",
            "reference_from",
            "capacity",
            "project_cost",
            "discount",
            "payment_type",
            "planned_delivery_date",
            "planned_priority",
            "planned_warehouse_id",
            "delivery_status",
            "stages",
            "current_stage_key",
            "bom_snapshot",
        ],
        include: [
            {
                model: Customer,
                as: "customer",
                attributes: ["id", "customer_name", "mobile_number", "address"],
            },
            { model: CompanyWarehouse, as: "plannedWarehouse", attributes: ["id", "name"], required: false },
        ],
        order: [["planned_delivery_date", "ASC"]],
    });

    const result = [];
    orders.forEach((o) => {
        const row = o.toJSON();
        // Skip fully delivered orders
        if (row.delivery_status === "complete") {
            return;
        }

        const bom = normalizeOrderBomSnapshot(row.bom_snapshot) || [];
        let totalRequired = 0;
        let totalShipped = 0;
        let totalPending = 0;
        bom.forEach((line) => {
            totalRequired += Number(line.quantity) || 0;
            totalShipped += Number(line.shipped_qty) || 0;
            totalPending += Number(line.pending_qty) || 0;
        });

        const warehouse = managedWarehouses.find(
            (w) => String(w.id) === String(row.planned_warehouse_id)
        );

        result.push({
            id: row.id,
            order_number: row.order_number,
            customer_name: row.customer?.customer_name || null,
            mobile_number: row.customer?.mobile_number || null,
            address: row.customer?.address || null,
            capacity: row.capacity,
            project_cost: row.project_cost,
            planned_delivery_date: row.planned_delivery_date,
            planned_priority: row.planned_priority,
            planned_warehouse_id: row.planned_warehouse_id,
            planned_warehouse_name: row.plannedWarehouse?.name || warehouse?.name || null,
            total_required: totalRequired,
            total_shipped: totalShipped,
            total_pending: totalPending,
            delivery_status: row.delivery_status || null,
        });
    });

    return result;
};

/**
 * List delivery execution orders for warehouse managers, grouped by delivery status.
 * - Only orders for warehouses managed by the current user
 * - Excludes cancelled orders
 * - Completed column is limited to last 15 days (based on updated_at)
 */
const listDeliveryExecutionOrders = async ({
    user_id,
    user_ids = [],
    q = null,
    order_number = null,
    customer_name = null,
    mobile_number = null,
    contact_number = null,
    address = null,
    consumer_no = null,
    reference_from = null,
    payment_type = null,
    planned_priority = null,
    delivery_status = null,
    planned_warehouse_id = null,
    order_date_from = null,
    order_date_to = null,
    planned_delivery_date_from = null,
    planned_delivery_date_to = null,
} = {}) => {
    if (!user_id) {
        return [];
    }
    const models = getTenantModels();
    const { Order, Customer, User, CompanyWarehouse, ProjectScheme, Discom, CompanyBranch, Product } = models;
    const allowedUserIds = Array.isArray(user_ids) && user_ids.length > 0
        ? user_ids
        : [user_id];

    // Reuse logic to find warehouses where the user is a manager
    const managedWarehouses = await CompanyWarehouse.findAll({
        include: [
            {
                model: User,
                as: "managers",
                attributes: [],
                required: true,
                where: { id: { [Op.in]: allowedUserIds } },
            },
        ],
        attributes: ["id", "name"],
        where: { deleted_at: null },
    });

    const warehouseIds = managedWarehouses.map((w) => w.id);
    if (warehouseIds.length === 0) {
        return [];
    }

    const where = {
        deleted_at: null,
        planned_warehouse_id: { [Op.in]: warehouseIds },
        status: { [Op.notIn]: ["cancelled"] },
    };
    if (delivery_status && String(delivery_status).toLowerCase() !== "all") {
        where.delivery_status = String(delivery_status).toLowerCase();
    }
    if (planned_warehouse_id != null && String(planned_warehouse_id).trim() !== "") {
        const allowedWarehouseIds = warehouseIds.map((id) => String(id));
        if (allowedWarehouseIds.includes(String(planned_warehouse_id))) {
            where.planned_warehouse_id = planned_warehouse_id;
        } else {
            return [];
        }
    }
    if (order_number) {
        where.order_number = { [Op.iLike]: `%${order_number}%` };
    }
    if (consumer_no) {
        where.consumer_no = { [Op.iLike]: `%${consumer_no}%` };
    }
    if (reference_from) {
        where.reference_from = { [Op.iLike]: `%${reference_from}%` };
    }
    if (payment_type) {
        where.payment_type = { [Op.iLike]: `%${payment_type}%` };
    }
    if (planned_priority) {
        where.planned_priority = { [Op.iLike]: `%${planned_priority}%` };
    }
    if (order_date_from || order_date_to) {
        where.order_date = {};
        if (order_date_from) where.order_date[Op.gte] = order_date_from;
        if (order_date_to) where.order_date[Op.lte] = order_date_to;
    }
    if (planned_delivery_date_from || planned_delivery_date_to) {
        where.planned_delivery_date = {};
        if (planned_delivery_date_from) where.planned_delivery_date[Op.gte] = planned_delivery_date_from;
        if (planned_delivery_date_to) where.planned_delivery_date[Op.lte] = planned_delivery_date_to;
    }

    if (q) {
        where[Op.and] = where[Op.and] || [];
        where[Op.and].push({
            [Op.or]: [
                { order_number: { [Op.iLike]: `%${q}%` } },
                { consumer_no: { [Op.iLike]: `%${q}%` } },
                { reference_from: { [Op.iLike]: `%${q}%` } },
                { payment_type: { [Op.iLike]: `%${q}%` } },
                { planned_priority: { [Op.iLike]: `%${q}%` } },
            ],
        });
    }

    const customerAnd = [];
    if (customer_name) {
        customerAnd.push({ customer_name: { [Op.iLike]: `%${customer_name}%` } });
    }
    if (mobile_number) {
        customerAnd.push({ mobile_number: { [Op.iLike]: `%${mobile_number}%` } });
    }
    if (contact_number) {
        customerAnd.push({
            [Op.or]: [
                { mobile_number: { [Op.iLike]: `%${contact_number}%` } },
                { phone_no: { [Op.iLike]: `%${contact_number}%` } },
            ],
        });
    }
    if (address) {
        customerAnd.push({
            [Op.or]: [
                { address: { [Op.iLike]: `%${address}%` } },
                { landmark_area: { [Op.iLike]: `%${address}%` } },
                { taluka: { [Op.iLike]: `%${address}%` } },
                { district: { [Op.iLike]: `%${address}%` } },
                { pin_code: { [Op.iLike]: `%${address}%` } },
            ],
        });
    }
    const customerWhere = customerAnd.length > 0 ? { [Op.and]: customerAnd } : undefined;

    const orders = await Order.findAll({
        where,
        attributes: [
            "id",
            "order_number",
            "customer_id",
            "capacity",
            "project_cost",
            "planned_delivery_date",
            "planned_priority",
            "planned_warehouse_id",
            "delivery_status",
            "stages",
            "current_stage_key",
            "bom_snapshot",
            "updated_at",
            [
                models.sequelize.literal(`(
                    SELECT COALESCE(SUM(payment_amount), 0)
                    FROM order_payment_details
                    WHERE order_payment_details.order_id = "Order".id
                      AND order_payment_details.deleted_at IS NULL
                )`),
                "total_paid",
            ],
            [
                models.sequelize.literal(`(
                    SELECT MAX(challan_date)
                    FROM challans
                    WHERE challans.order_id = "Order".id
                      AND challans.deleted_at IS NULL
                )`),
                "last_challan_date",
            ],
            [
                models.sequelize.literal(`(
                    SELECT COUNT(1)
                    FROM challans
                    WHERE challans.order_id = "Order".id
                      AND challans.deleted_at IS NULL
                )`),
                "challan_count",
            ],
        ],
        include: [
            {
                model: Customer,
                as: "customer",
                required: !!customerWhere,
                where: customerWhere,
                attributes: [
                    "id",
                    "customer_name",
                    "mobile_number",
                    "phone_no",
                    "company_name",
                    "email_id",
                    "address",
                    "pin_code",
                    "landmark_area",
                    "taluka",
                    "district",
                ],
            },
            { model: ProjectScheme, as: "projectScheme", attributes: ["id", "name"], required: false },
            { model: Discom, as: "discom", attributes: ["id", "name"], required: false },
            { model: CompanyBranch, as: "branch", attributes: ["id", "name"], required: false },
            { model: User, as: "handledBy", attributes: ["id", "name"], required: false },
            { model: User, as: "inquiryBy", attributes: ["id", "name"], required: false },
            { model: User, as: "channelPartner", attributes: ["id", "name"], required: false },
            { model: Product, as: "solarPanel", attributes: ["id", "product_name"], required: false },
            { model: Product, as: "inverter", attributes: ["id", "product_name"], required: false },
            { model: CompanyWarehouse, as: "plannedWarehouse", attributes: ["id", "name"], required: false },
        ],
        order: [["planned_delivery_date", "ASC"]],
    });

    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const result = [];

    orders.forEach((o) => {
        const row = o.toJSON();

        // Derive kanban status from delivery_status
        const status = (row.delivery_status || "").toLowerCase();
        let kanbanStatus = "pending";
        if (status === "partial") kanbanStatus = "partial";
        if (status === "complete") kanbanStatus = "complete";

        // Completed: only keep last 15 days
        if (kanbanStatus === "complete") {
            const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
            if (!updatedAt || updatedAt < fifteenDaysAgo) {
                return;
            }
        }

        const bom = normalizeOrderBomSnapshot(row.bom_snapshot) || [];
        let totalRequired = 0;
        let totalShipped = 0;
        let totalPending = 0;
        bom.forEach((line) => {
            totalRequired += Number(line.quantity) || 0;
            totalShipped += Number(line.shipped_qty) || 0;
            totalPending += Number(line.pending_qty) || 0;
        });

        const warehouse = managedWarehouses.find(
            (w) => String(w.id) === String(row.planned_warehouse_id)
        );
        const totalPaid = Number(row.total_paid) || 0;
        const projectCost = Number(row.project_cost) || 0;
        const discount = Number(row.discount) || 0;
        const payableCost = Math.max(projectCost - discount, 0);
        const outstandingBalance = Math.max(payableCost - totalPaid, 0);

        result.push({
            id: row.id,
            order_number: row.order_number,
            order_date: row.order_date || null,
            customer_name: row.customer?.customer_name || null,
            mobile_number: row.customer?.mobile_number || null,
            phone_no: row.customer?.phone_no || null,
            company_name: row.customer?.company_name || null,
            email_id: row.customer?.email_id || null,
            address: row.customer?.address || null,
            pin_code: row.customer?.pin_code || null,
            landmark_area: row.customer?.landmark_area || null,
            taluka: row.customer?.taluka || null,
            district: row.customer?.district || null,
            consumer_no: row.consumer_no || null,
            reference_from: row.reference_from || null,
            payment_type: row.payment_type || null,
            capacity: row.capacity,
            project_cost: row.project_cost,
            discount,
            payable_cost: payableCost,
            total_paid: totalPaid,
            outstanding_balance: outstandingBalance,
            project_scheme_name: row.projectScheme?.name || null,
            discom_name: row.discom?.name || null,
            branch_name: row.branch?.name || null,
            handled_by_name: row.handledBy?.name || null,
            inquiry_by_name: row.inquiryBy?.name || null,
            channel_partner_name: row.channelPartner?.name || null,
            solar_panel_name: row.solarPanel?.product_name || null,
            inverter_name: row.inverter?.product_name || null,
            planned_delivery_date: row.planned_delivery_date,
            planned_priority: row.planned_priority,
            planned_warehouse_id: row.planned_warehouse_id,
            planned_warehouse_name: row.plannedWarehouse?.name || warehouse?.name || null,
            delivery_status: row.delivery_status || null,
            kanban_status: kanbanStatus,
            last_challan_date: row.last_challan_date || null,
            challan_count: Number(row.challan_count) || 0,
            total_required: totalRequired,
            total_shipped: totalShipped,
            total_pending: totalPending,
        });
    });

    const toDateTime = (value, fallback) => {
        const ts = value ? new Date(value).getTime() : Number.NaN;
        return Number.isFinite(ts) ? ts : fallback;
    };

    const pending = result
        .filter((r) => r.kanban_status === "pending")
        .sort(
            (a, b) =>
                toDateTime(a.planned_delivery_date, Number.MAX_SAFE_INTEGER) -
                toDateTime(b.planned_delivery_date, Number.MAX_SAFE_INTEGER)
        );

    const partial = result
        .filter((r) => r.kanban_status === "partial")
        .sort(
            (a, b) =>
                toDateTime(a.planned_delivery_date, Number.MAX_SAFE_INTEGER) -
                toDateTime(b.planned_delivery_date, Number.MAX_SAFE_INTEGER)
        );

    const complete = result
        .filter((r) => r.kanban_status === "complete")
        .sort(
            (a, b) =>
                toDateTime(b.last_challan_date, 0) - toDateTime(a.last_challan_date, 0)
        );

    const remaining = result
        .filter((r) => !["pending", "partial", "complete"].includes(r.kanban_status))
        .sort(
            (a, b) =>
                toDateTime(a.planned_delivery_date, Number.MAX_SAFE_INTEGER) -
                toDateTime(b.planned_delivery_date, Number.MAX_SAFE_INTEGER)
        );

    return [...pending, ...partial, ...complete, ...remaining];
};

/**
 * List orders for Fabrication & Installation team: filter by logged-in user as fabricator/installer and tab.
 * Tab: pending_fabrication | pending_installation | completed_fabrication_15d | completed_installation_15d
 */
const listFabricationInstallationOrders = async ({
    user_id,
    user_ids = null,
    tab,
    order_number = null,
    customer_name = null,
    contact_number = null,
    consumer_no = null,
    address = null,
} = {}) => {
    if (!user_id || !tab) return [];
    const models = getTenantModels();
    const { Order, Fabrication, Installation, Customer, User, ProjectScheme, Discom, CompanyBranch, Product, CompanyWarehouse } = models;
    const scopedUserIds = Array.isArray(user_ids)
        ? user_ids.filter((id) => Number.isInteger(Number(id)) && Number(id) > 0).map((id) => Number(id))
        : null;
    const hasScopedUserIds = Array.isArray(scopedUserIds);
    const hasAnyScopedUsers = hasScopedUserIds && scopedUserIds.length > 0;

    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const where = {
        deleted_at: null,
        status: { [Op.notIn]: ["cancelled"] },
    };

    const tabVal = String(tab);
    if (tabVal === "pending_fabrication") {
        const fabricatorCond = hasScopedUserIds
            ? (hasAnyScopedUsers ? { fabricator_id: { [Op.in]: scopedUserIds } } : { fabricator_id: { [Op.in]: [-1] } })
            : { fabricator_id: user_id };
        const sameAssigneeCond = hasScopedUserIds
            ? (hasAnyScopedUsers ? { fabricator_installer_id: { [Op.in]: scopedUserIds } } : { fabricator_installer_id: { [Op.in]: [-1] } })
            : { fabricator_installer_id: user_id };
        where[Op.and] = [
            { [Op.or]: [fabricatorCond, sameAssigneeCond] },
            models.sequelize.literal("(stages->>'planner') = 'completed'"),
            models.sequelize.literal("(stages->>'fabrication') IS DISTINCT FROM 'completed'"),
        ];
    } else if (tabVal === "pending_installation") {
        const installerCond = hasScopedUserIds
            ? (hasAnyScopedUsers ? { installer_id: { [Op.in]: scopedUserIds } } : { installer_id: { [Op.in]: [-1] } })
            : { installer_id: user_id };
        const sameAssigneeCond = hasScopedUserIds
            ? (hasAnyScopedUsers ? { fabricator_installer_id: { [Op.in]: scopedUserIds } } : { fabricator_installer_id: { [Op.in]: [-1] } })
            : { fabricator_installer_id: user_id };
        where[Op.and] = [
            { [Op.or]: [installerCond, sameAssigneeCond] },
            models.sequelize.literal("(stages->>'fabrication') = 'completed'"),
            models.sequelize.literal("(stages->>'installation') IS DISTINCT FROM 'completed'"),
        ];
    } else if (tabVal === "completed_fabrication_15d") {
        const fabricatorCond = hasScopedUserIds
            ? (hasAnyScopedUsers ? { fabricator_id: { [Op.in]: scopedUserIds } } : { fabricator_id: { [Op.in]: [-1] } })
            : { fabricator_id: user_id };
        const sameAssigneeCond = hasScopedUserIds
            ? (hasAnyScopedUsers ? { fabricator_installer_id: { [Op.in]: scopedUserIds } } : { fabricator_installer_id: { [Op.in]: [-1] } })
            : { fabricator_installer_id: user_id };
        where[Op.and] = [
            { [Op.or]: [fabricatorCond, sameAssigneeCond] },
            models.sequelize.literal("(stages->>'fabrication') = 'completed'"),
            { fabrication_completed_at: { [Op.gte]: fifteenDaysAgo } },
        ];
    } else if (tabVal === "completed_installation_15d") {
        const installerCond = hasScopedUserIds
            ? (hasAnyScopedUsers ? { installer_id: { [Op.in]: scopedUserIds } } : { installer_id: { [Op.in]: [-1] } })
            : { installer_id: user_id };
        const sameAssigneeCond = hasScopedUserIds
            ? (hasAnyScopedUsers ? { fabricator_installer_id: { [Op.in]: scopedUserIds } } : { fabricator_installer_id: { [Op.in]: [-1] } })
            : { fabricator_installer_id: user_id };
        where[Op.and] = [
            { [Op.or]: [installerCond, sameAssigneeCond] },
            models.sequelize.literal("(stages->>'installation') = 'completed'"),
            { installation_completed_at: { [Op.gte]: fifteenDaysAgo } },
        ];
    } else {
        return [];
    }

    if (order_number) where.order_number = { [Op.iLike]: `%${order_number}%` };
    if (consumer_no) where.consumer_no = { [Op.iLike]: `%${consumer_no}%` };

    const customerAnd = [];
    if (customer_name) customerAnd.push({ customer_name: { [Op.iLike]: `%${customer_name}%` } });
    if (contact_number) {
        customerAnd.push({
            [Op.or]: [
                { mobile_number: { [Op.iLike]: `%${contact_number}%` } },
                { phone_no: { [Op.iLike]: `%${contact_number}%` } },
            ],
        });
    }
    if (address) {
        customerAnd.push({
            [Op.or]: [
                { address: { [Op.iLike]: `%${address}%` } },
                { landmark_area: { [Op.iLike]: `%${address}%` } },
                { taluka: { [Op.iLike]: `%${address}%` } },
                { district: { [Op.iLike]: `%${address}%` } },
                { pin_code: { [Op.iLike]: `%${address}%` } },
            ],
        });
    }
    const customerWhere = customerAnd.length > 0 ? { [Op.and]: customerAnd } : undefined;

    const orders = await Order.findAll({
        where,
        attributes: [
            "id",
            "order_number",
            "order_date",
            "customer_id",
            "capacity",
            "project_cost",
            "discount",
            "planned_delivery_date",
            "planned_priority",
            "planned_warehouse_id",
            "stages",
            "fabrication_completed_at",
            "installation_completed_at",
            "fabricator_id",
            "installer_id",
            "fabricator_installer_id",
            "consumer_no",
            "reference_from",
            "payment_type",
            [
                models.sequelize.literal(`(
                    SELECT COALESCE(SUM(payment_amount), 0)
                    FROM order_payment_details
                    WHERE order_payment_details.order_id = "Order".id
                      AND order_payment_details.deleted_at IS NULL
                )`),
                "total_paid",
            ],
        ],
        include: [
            {
                model: Customer,
                as: "customer",
                required: !!customerWhere,
                where: customerWhere,
                attributes: [
                    "id",
                    "customer_name",
                    "mobile_number",
                    "phone_no",
                    "company_name",
                    "email_id",
                    "address",
                    "pin_code",
                    "landmark_area",
                    "taluka",
                    "district",
                ],
            },
            { model: ProjectScheme, as: "projectScheme", attributes: ["id", "name"], required: false },
            { model: Discom, as: "discom", attributes: ["id", "name"], required: false },
            { model: CompanyBranch, as: "branch", attributes: ["id", "name"], required: false },
            { model: User, as: "handledBy", attributes: ["id", "name"], required: false },
            { model: Product, as: "solarPanel", attributes: ["id", "product_name"], required: false },
            { model: Product, as: "inverter", attributes: ["id", "product_name"], required: false },
            { model: CompanyWarehouse, as: "plannedWarehouse", attributes: ["id", "name"], required: false },
        ],
        order: [
            ["fabrication_completed_at", "DESC"],
            ["installation_completed_at", "DESC"],
            ["planned_delivery_date", "ASC"],
        ],
    });

    const result = orders.map((o) => {
        const row = o.toJSON();
        const totalPaid = Number(row.total_paid) || 0;
        const projectCost = Number(row.project_cost) || 0;
        const discount = Number(row.discount) || 0;
        const payableCost = Math.max(projectCost - discount, 0);
        const outstandingBalance = Math.max(payableCost - totalPaid, 0);
        return {
            id: row.id,
            order_number: row.order_number,
            order_date: row.order_date || null,
            customer_name: row.customer?.customer_name || null,
            mobile_number: row.customer?.mobile_number || null,
            phone_no: row.customer?.phone_no || null,
            company_name: row.customer?.company_name || null,
            email_id: row.customer?.email_id || null,
            address: row.customer?.address || null,
            pin_code: row.customer?.pin_code || null,
            landmark_area: row.customer?.landmark_area || null,
            taluka: row.customer?.taluka || null,
            district: row.customer?.district || null,
            consumer_no: row.consumer_no || null,
            reference_from: row.reference_from || null,
            payment_type: row.payment_type || null,
            capacity: row.capacity,
            project_cost: row.project_cost,
            discount,
            payable_cost: payableCost,
            total_paid: totalPaid,
            outstanding_balance: outstandingBalance,
            project_scheme_name: row.projectScheme?.name || null,
            discom_name: row.discom?.name || null,
            branch_name: row.branch?.name || null,
            handled_by_name: row.handledBy?.name || null,
            solar_panel_name: row.solarPanel?.product_name || null,
            inverter_name: row.inverter?.product_name || null,
            planned_delivery_date: row.planned_delivery_date,
            planned_priority: row.planned_priority,
            planned_warehouse_name: row.plannedWarehouse?.name || null,
            fabrication_completed_at: row.fabrication_completed_at || null,
            installation_completed_at: row.installation_completed_at || null,
            stages: row.stages || null,
        };
    });

    return result;
};

const getSolarPanels = async () => {
    const models = getTenantModels();
    const { Product } = models;
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
    const models = getTenantModels();
    const { Product } = models;
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
    listPendingDeliveryOrders,
    listDeliveryExecutionOrders,
    listFabricationInstallationOrders,
};
