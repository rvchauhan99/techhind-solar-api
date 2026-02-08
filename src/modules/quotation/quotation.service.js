"use strict";

const ExcelJS = require("exceljs");
const db = require("../../models/index.js");
const { INQUIRY_STATUS } = require("../../common/utils/constants.js");

const listQuotations = async ({
    search,
    inquiry_id,
    page = 1,
    limit = 20,
    sortBy = "created_at",
    sortOrder = "DESC",
    quotation_number,
    quotation_date_from,
    quotation_date_to,
    valid_till_from,
    valid_till_to,
    customer_name,
    project_capacity,
    project_capacity_op,
    project_capacity_to,
    total_project_value,
    total_project_value_op,
    total_project_value_to,
    is_approved,
    user_name,
    branch_name,
    state_name,
    order_type_name,
    project_scheme_name,
    inquiry_number,
    mobile_number,
    created_at_from,
    created_at_to,
} = {}) => {
    const { Quotation, User, CompanyBranch, Customer, State, OrderType, ProjectScheme, ProjectPrice, Inquiry, ProductMake } = db;
    const { Op } = db.Sequelize;

    const where = { deleted_at: null };

    const userInclude = {
        model: User,
        as: "user",
        attributes: ["id", "name", "mobile_number"],
        required: !!user_name,
        ...(user_name && { where: { name: { [Op.iLike]: `%${user_name}%` } } }),
    };
    const branchInclude = {
        model: CompanyBranch,
        as: "branch",
        attributes: ["id", "name"],
        required: !!branch_name,
        ...(branch_name && { where: { name: { [Op.iLike]: `%${branch_name}%` } } }),
    };
    const customerInclude = {
        model: Customer,
        as: "customer",
        attributes: ["id", "customer_name", "mobile_number"],
    };
    const stateInclude = {
        model: State,
        as: "state",
        attributes: ["id", "name"],
        required: !!state_name,
        ...(state_name && { where: { name: { [Op.iLike]: `%${state_name}%` } } }),
    };
    const orderTypeInclude = {
        model: OrderType,
        as: "orderType",
        attributes: ["id", "name"],
        required: !!order_type_name,
        ...(order_type_name && { where: { name: { [Op.iLike]: `%${order_type_name}%` } } }),
    };
    const projectSchemeInclude = {
        model: ProjectScheme,
        as: "projectScheme",
        attributes: ["id", "name"],
        required: !!project_scheme_name,
        ...(project_scheme_name && { where: { name: { [Op.iLike]: `%${project_scheme_name}%` } } }),
    };
    const inquiryInclude = {
        model: Inquiry,
        as: "inquiry",
        attributes: ["id", "inquiry_number"],
        required: !!inquiry_number,
        ...(inquiry_number && { where: { inquiry_number: { [Op.iLike]: `%${inquiry_number}%` } } }),
    };

    const include = [
        userInclude,
        branchInclude,
        customerInclude,
        stateInclude,
        orderTypeInclude,
        projectSchemeInclude,
        { model: ProjectPrice, as: "projectPrice", attributes: ["id", "project_capacity"] },
        inquiryInclude,
    ];

    if (search) {
        where[Op.or] = [
            { quotation_number: { [Op.iLike]: `%${search}%` } },
            { customer_name: { [Op.iLike]: `%${search}%` } },
        ];
    }

    if (inquiry_id) {
        where.inquiry_id = inquiry_id;
    }

    if (quotation_number) {
        where.quotation_number = { [Op.iLike]: `%${quotation_number}%` };
    }

    if (customer_name) {
        where.customer_name = { [Op.iLike]: `%${customer_name}%` };
    }

    if (mobile_number) {
        where.mobile_number = { [Op.iLike]: `%${mobile_number}%` };
    }

    if (is_approved !== undefined && is_approved !== "" && is_approved !== null) {
        where.is_approved = is_approved === "true" || is_approved === true;
    }

    if (quotation_date_from || quotation_date_to) {
        where.quotation_date = where.quotation_date || {};
        if (quotation_date_from) where.quotation_date[Op.gte] = quotation_date_from;
        if (quotation_date_to) where.quotation_date[Op.lte] = quotation_date_to;
        if (Reflect.ownKeys(where.quotation_date).length === 0) delete where.quotation_date;
    }

    if (valid_till_from || valid_till_to) {
        where.valid_till = where.valid_till || {};
        if (valid_till_from) where.valid_till[Op.gte] = valid_till_from;
        if (valid_till_to) where.valid_till[Op.lte] = valid_till_to;
        if (Reflect.ownKeys(where.valid_till).length === 0) delete where.valid_till;
    }

    if (project_capacity || project_capacity_to) {
        const cap = parseFloat(project_capacity);
        const capTo = parseFloat(project_capacity_to);
        if (!Number.isNaN(cap) || !Number.isNaN(capTo)) {
            const cond = {};
            const opStr = (project_capacity_op || "").toLowerCase();
            if (opStr === "between" && !Number.isNaN(cap) && !Number.isNaN(capTo)) {
                cond[Op.between] = [cap, capTo];
            } else if (opStr === "gt" && !Number.isNaN(cap)) cond[Op.gt] = cap;
            else if (opStr === "lt" && !Number.isNaN(cap)) cond[Op.lt] = cap;
            else if (opStr === "gte" && !Number.isNaN(cap)) cond[Op.gte] = cap;
            else if (opStr === "lte" && !Number.isNaN(cap)) cond[Op.lte] = cap;
            else if (!Number.isNaN(cap)) cond[Op.eq] = cap;
            if (Reflect.ownKeys(cond).length > 0) where.project_capacity = cond;
        }
    }

    if (total_project_value || total_project_value_to) {
        const val = parseFloat(total_project_value);
        const valTo = parseFloat(total_project_value_to);
        if (!Number.isNaN(val) || !Number.isNaN(valTo)) {
            const valCond = {};
            const opStr = (total_project_value_op || "").toLowerCase();
            if (opStr === "between" && !Number.isNaN(val) && !Number.isNaN(valTo)) {
                valCond[Op.between] = [val, valTo];
            } else if (opStr === "gt" && !Number.isNaN(val)) valCond[Op.gt] = val;
            else if (opStr === "lt" && !Number.isNaN(val)) valCond[Op.lt] = val;
            else if (opStr === "gte" && !Number.isNaN(val)) valCond[Op.gte] = val;
            else if (opStr === "lte" && !Number.isNaN(val)) valCond[Op.lte] = val;
            else if (!Number.isNaN(val)) valCond[Op.eq] = val;
            if (Reflect.ownKeys(valCond).length > 0) where.total_project_value = valCond;
        }
    }

    if (created_at_from || created_at_to) {
        where.created_at = where.created_at || {};
        if (created_at_from) where.created_at[Op.gte] = created_at_from;
        if (created_at_to) where.created_at[Op.lte] = created_at_to;
        if (Reflect.ownKeys(where.created_at).length === 0) delete where.created_at;
    }

    const orderClause = sortBy ? [[sortBy, (sortOrder || "DESC").toUpperCase()]] : [["created_at", "DESC"]];
    const offset = (page - 1) * limit;
    const findOptions = {
        where,
        include,
        order: orderClause,
    };

    if (page && limit) {
        findOptions.offset = offset;
        findOptions.limit = limit;
    }

    const count = await Quotation.count({ where });
    const list = await Quotation.findAll(findOptions);

    const data = list.map((it) => {
        const row = it.toJSON();
        return {
            id: row.id,
            quotation_number: row.quotation_number,
            quotation_date: row.quotation_date,
            valid_till: row.valid_till,
            customer_name: row.customer_name || row.customer?.customer_name,
            mobile_number: row.mobile_number || row.customer?.mobile_number,
            project_capacity: row.project_capacity,
            project_cost: row.project_cost,
            total_project_value: row.total_project_value,
            is_approved: row.is_approved,
            panel_product: row.panel_product,
            inverter_product: row.inverter_product,
            order_type_id: row.order_type_id,
            project_scheme_id: row.project_scheme_id,
            user_name: row.user?.name,
            branch_name: row.branch?.name,
            state_name: row.state?.name,
            order_type_name: row.orderType?.name,
            project_scheme_name: row.projectScheme?.name,
            inquiry_number: row.inquiry?.inquiry_number,
            created_at: row.created_at,
            status: row.status,
            status_on: row.status_on,
            panel_make: row.panel_make,
        };
    });

    // Return paginated response if page and limit are provided
    if (page && limit) {
        return {
            data,
            meta: {
                page,
                limit,
                total: count,
                pages: Math.ceil(count / limit),
            },
        };
    }

    // Return simple array for backward compatibility
    return data;
};

const exportQuotations = async (params = {}) => {
    const result = await listQuotations({ ...params, page: 1, limit: 10000 });
    const data = Array.isArray(result) ? result : result?.data || [];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Quotations");
    worksheet.columns = [
        { header: "Quotation #", key: "quotation_number", width: 18 },
        { header: "Date", key: "quotation_date", width: 12 },
        { header: "Valid Till", key: "valid_till", width: 12 },
        { header: "Customer", key: "customer_name", width: 24 },
        { header: "Mobile", key: "mobile_number", width: 14 },
        { header: "Capacity", key: "project_capacity", width: 12 },
        { header: "Cost", key: "project_cost", width: 14 },
        { header: "Status", key: "status", width: 12 },
        { header: "Created At", key: "created_at", width: 22 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    data.forEach((q) => {
        worksheet.addRow({
            quotation_number: q.quotation_number || "",
            quotation_date: q.quotation_date ? new Date(q.quotation_date).toISOString().split("T")[0] : "",
            valid_till: q.valid_till ? new Date(q.valid_till).toISOString().split("T")[0] : "",
            customer_name: q.customer_name || "",
            mobile_number: q.mobile_number || "",
            project_capacity: q.project_capacity != null ? q.project_capacity : "",
            project_cost: q.project_cost != null ? q.project_cost : "",
            status: q.status || "",
            created_at: q.created_at ? new Date(q.created_at).toISOString() : "",
        });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
};

const getQuotationById = async ({ id }) => {
    const { Quotation, User, CompanyBranch, Customer, State, OrderType, ProjectScheme, ProjectPrice, Inquiry } = db;
    if (!id) return null;

    const found = await Quotation.findOne({
        where: { id, deleted_at: null },
        include: [
            { model: User, as: "user", attributes: ["id", "name", "mobile_number"] },
            { model: CompanyBranch, as: "branch", attributes: ["id", "name"] },
            { model: Customer, as: "customer", attributes: ["id", "customer_name", "mobile_number", "email_id", "company_name"] },
            { model: State, as: "state", attributes: ["id", "name"] },
            { model: OrderType, as: "orderType", attributes: ["id", "name"] },
            { model: ProjectScheme, as: "projectScheme", attributes: ["id", "name"] },
            { model: ProjectPrice, as: "projectPrice", attributes: ["id", "project_capacity", "total_project_value"] },
            { model: Inquiry, as: "inquiry", attributes: ["id", "inquiry_number"] },
        ],
    });

    if (!found) return null;
    return found.toJSON();
};

const createQuotation = async ({ payload, transaction } = {}) => {
    const { Quotation, Inquiry, Customer } = db;

    const t = transaction || (await db.sequelize.transaction());
    let committedHere = !transaction;

    try {
        let inquiryNumber = null;
        let quotationCount = 0;

        // If we have an existing inquiry_id, get its inquiry_number and count quotations
        if (payload.inquiry_id) {
            const existingInquiry = await Inquiry.findOne({
                where: { id: payload.inquiry_id },
                transaction: t
            });
            if (existingInquiry) {
                inquiryNumber = existingInquiry.inquiry_number;
                // Count existing quotations for this inquiry
                quotationCount = await Quotation.count({
                    where: { inquiry_id: payload.inquiry_id, deleted_at: null },
                    transaction: t
                });
            }

            // Update inquiry status
            await Inquiry.update(
                { status: INQUIRY_STATUS.QUOTATION, is_dead: false },
                { where: { id: payload.inquiry_id }, transaction: t }
            );
        }

        // Create the quotation (without quotation_number initially if we need to create inquiry first)
        const created = await Quotation.create(payload, { transaction: t });

        // Auto-create Inquiry if not present
        if (!payload.inquiry_id) {
            let customerId = created.customer_id;

            // If no customer linked, create one from quotation details
            if (!customerId && (created.customer_name || created.mobile_number)) {
                const newCustomer = await Customer.create({
                    customer_name: created.customer_name,
                    mobile_number: created.mobile_number,
                    email_id: created.email,
                    company_name: created.company_name,
                    address: created.address,
                    state_id: created.state_id,
                }, { transaction: t });
                customerId = newCustomer.id;

                // Update the quotation to link to this new customer
                created.customer_id = customerId;
            }

            if (customerId) {
                const newInquiry = await Inquiry.create({
                    customer_id: customerId,
                    date_of_inquiry: new Date(),
                    inquiry_by: created.user_id,
                    handled_by: created.user_id,
                    branch_id: created.branch_id,
                    project_scheme_id: created.project_scheme_id,
                    capacity: created.project_capacity,
                    order_type: created.order_type_id,
                    status: INQUIRY_STATUS.QUOTATION,
                }, { transaction: t });

                created.inquiry_id = newInquiry.id;
                inquiryNumber = newInquiry.inquiry_number;
                quotationCount = 0; // First quotation for new inquiry
            }
        }

        // Generate quotation_number based on inquiry
        if (inquiryNumber) {
            created.quotation_number = `${inquiryNumber}/${quotationCount + 1}`;
        }

        await created.save({ transaction: t });

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

const updateQuotation = async ({ id, payload, transaction } = {}) => {
    const { Quotation } = db;
    if (!id) return null;

    const t = transaction || (await db.sequelize.transaction());
    let committedHere = !transaction;

    try {
        const quotation = await Quotation.findOne({
            where: { id, deleted_at: null },
            transaction: t,
        });
        if (!quotation) throw new Error("Quotation not found");

        await quotation.update(payload, { transaction: t });

        if (committedHere) {
            await t.commit();
        }

        return quotation.toJSON();
    } catch (err) {
        if (committedHere) {
            await t.rollback();
        }
        throw err;
    }
};

const approveQuotation = async ({ id, transaction } = {}) => {
    const { Quotation } = db;
    const { Op } = db.Sequelize;
    if (!id) return null;

    const t = transaction || (await db.sequelize.transaction());
    let committedHere = !transaction;

    try {
        const quotation = await Quotation.findOne({
            where: { id, deleted_at: null },
            transaction: t,
        });
        if (!quotation) throw new Error("Quotation not found");

        const inquiryId = quotation.inquiry_id;
        if (inquiryId) {
            await Quotation.update(
                { is_approved: false },
                { where: { inquiry_id: inquiryId, id: { [Op.ne]: id }, deleted_at: null }, transaction: t }
            );
        }
        await quotation.update({ is_approved: true }, { transaction: t });

        if (committedHere) {
            await t.commit();
        }

        return quotation.toJSON();
    } catch (err) {
        if (committedHere) {
            await t.rollback();
        }
        throw err;
    }
};

const unapproveQuotation = async ({ id, transaction } = {}) => {
    const { Quotation } = db;
    if (!id) return null;

    const t = transaction || (await db.sequelize.transaction());
    let committedHere = !transaction;

    try {
        const quotation = await Quotation.findOne({
            where: { id, deleted_at: null },
            transaction: t,
        });
        if (!quotation) throw new Error("Quotation not found");

        await quotation.update({ is_approved: false }, { transaction: t });

        if (committedHere) {
            await t.commit();
        }

        return quotation.toJSON();
    } catch (err) {
        if (committedHere) {
            await t.rollback();
        }
        throw err;
    }
};

const deleteQuotation = async ({ id, transaction } = {}) => {
    const { Quotation } = db;
    if (!id) return null;

    const t = transaction || (await db.sequelize.transaction());
    let committedHere = !transaction;

    try {
        const quotation = await Quotation.findOne({
            where: { id, deleted_at: null },
            transaction: t,
        });
        if (!quotation) throw new Error("Quotation not found");

        await quotation.destroy({ transaction: t });

        if (committedHere) {
            await t.commit();
        }

        return { message: "Quotation deleted successfully" };
    } catch (err) {
        if (committedHere) {
            await t.rollback();
        }
        throw err;
    }
};

const getProjectPrices = async ({ schemeId, transaction } = {}) => {
    const { ProjectPrice } = db;
    const projectPrices = await ProjectPrice.findAll({
        where: { project_for_id: schemeId },
    });
    return projectPrices

};

const getProjectPriceBomDetails = async ({ id, transaction } = {}) => {
    const { ProjectPrice, BillOfMaterial, Product, ProductType } = db;

    const projectPrice = await ProjectPrice.findOne({
        where: { id, deleted_at: null },
        include: [
            {
                model: BillOfMaterial,
                as: 'billOfMaterial',
                attributes: ['id', 'bom_name', 'bom_code', 'bom_detail']
            }
        ]
    });

    if (!projectPrice) return null;

    const data = projectPrice.toJSON();

    // 2) Lookup product details for each item in bom_detail
    if (data?.billOfMaterial?.bom_detail?.length) {

        const productIds = data.billOfMaterial.bom_detail.map(i => i.product_id);

        const products = await Product.findAll({
            where: { id: productIds },
            include: [
                {
                    model: ProductType,
                    as: 'productType',
                    attributes: ['id', 'name']
                }
            ],
            transaction
        });

        const productMap = {};
        products.forEach(p => productMap[p.id] = p.toJSON());

        // 3) Merge product info into each bom_detail item
        data.billOfMaterial.bom_detail = data.billOfMaterial.bom_detail.map(item => ({
            ...item,
            product: productMap[item.product_id] || null
        }));
    }

    return data;

};

const getProductMakes = async ({ transaction } = {}) => {
    const { ProductMake, ProductType } = db;
    const productMakes = await ProductMake.findAll({ where: { deleted_at: null }, include: [{ model: ProductType, as: 'productType', attributes: ['id', 'name'] }], transaction });
    return productMakes.map((item) => item.toJSON());
};

const getNextQuotationNumber = async () => {
    const { Quotation } = db;
    // Create a temporary instance to trigger the beforeCreate hook logic
    // We'll use the model's generateQuotationNumber function directly
    // const quotationNumber = await Quotation.sequelize.models.Quotation.beforeCreate({ quotation_number: null });

    // Alternative: directly call the generation logic
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const yymm = `${year}${month}`;

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const results = await db.sequelize.query(
        `SELECT COUNT(*) as count 
         FROM quotations 
         WHERE created_at >= :startOfMonth 
           AND created_at <= :endOfMonth 
           AND deleted_at IS NULL`,
        {
            replacements: {
                startOfMonth: startOfMonth.toISOString(),
                endOfMonth: endOfMonth.toISOString(),
            },
            type: db.sequelize.QueryTypes.SELECT,
        }
    );

    const count = parseInt(results[0]?.count || results[0]?.COUNT || 0) || 0;
    const minRange = (count + 1) * 10;
    const maxRange = (count + 2) * 10 - 1;
    const randomNum = Math.floor(Math.random() * (maxRange - minRange + 1)) + minRange;

    return `${yymm}${randomNum}`;
};

const getQuotationCountByInquiry = async ({ inquiry_id }) => {
    const { Quotation } = db;

    if (!inquiry_id) return 0;

    const count = await Quotation.count({
        where: {
            inquiry_id,
            deleted_at: null
        }
    });

    return count;
};

const getAllProducts = async () => {
    const { Product, ProductType } = db;

    const products = await Product.findAll({
        where: { deleted_at: null },
        include: [
            {
                model: ProductType,
                as: 'productType',
                attributes: ['id', 'name']
            }
        ]
    });

    return products.map(p => p.toJSON());
};


module.exports = {
    listQuotations,
    exportQuotations,
    getQuotationById,
    createQuotation,
    updateQuotation,
    approveQuotation,
    unapproveQuotation,
    deleteQuotation,
    getProjectPrices,
    getProjectPriceBomDetails,
    getProductMakes,
    getNextQuotationNumber,
    getQuotationCountByInquiry,
    getAllProducts
};
