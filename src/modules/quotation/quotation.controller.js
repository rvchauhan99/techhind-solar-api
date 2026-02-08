"use strict";

const { asyncHandler } = require("../../common/utils/asyncHandler.js");
const responseHandler = require("../../common/utils/responseHandler.js");
const AppError = require("../../common/errors/AppError.js");
const quotationService = require("./quotation.service.js");
const pdfService = require("./pdf.service.js");
const bucketService = require("../../common/services/bucket.service.js");
const db = require("../../models/index.js");

const FILE_UNAVAILABLE_MESSAGE =
    "We couldn't save your documents right now. Please try again in a few minutes.";

const list = asyncHandler(async (req, res) => {
    const {
        q,
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
        mobile_number,
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
        created_at_from,
        created_at_to,
    } = req.query;
    const items = await quotationService.listQuotations({
        search: q,
        inquiry_id: inquiry_id ? parseInt(inquiry_id, 10) : undefined,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sortBy,
        sortOrder,
        quotation_number,
        quotation_date_from,
        quotation_date_to,
        valid_till_from,
        valid_till_to,
        customer_name,
        mobile_number,
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
        created_at_from,
        created_at_to,
    });
    return responseHandler.sendSuccess(res, items, "Quotation list fetched", 200);
});

const exportList = asyncHandler(async (req, res) => {
    const {
        q,
        inquiry_id,
        quotation_number,
        quotation_date_from,
        quotation_date_to,
        valid_till_from,
        valid_till_to,
        customer_name,
        mobile_number,
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
        created_at_from,
        created_at_to,
    } = req.query;
    const buffer = await quotationService.exportQuotations({
        search: q,
        inquiry_id: inquiry_id ? parseInt(inquiry_id, 10) : undefined,
        quotation_number,
        quotation_date_from,
        quotation_date_to,
        valid_till_from,
        valid_till_to,
        customer_name,
        mobile_number,
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
        created_at_from,
        created_at_to,
    });
    const filename = `quotations-${new Date().toISOString().split("T")[0]}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buffer);
});

const getById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await quotationService.getQuotationById({ id });
    if (!item) {
        return responseHandler.sendError(res, "Quotation not found", 404);
    }
    return responseHandler.sendSuccess(res, item, "Quotation fetched", 200);
});

const create = asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    const created = await quotationService.createQuotation({
        payload,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, created, "Quotation created", 201);
});

const update = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = { ...req.body };
    const updated = await quotationService.updateQuotation({
        id,
        payload,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, updated, "Quotation updated", 200);
});

const remove = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await quotationService.deleteQuotation({
        id,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, result, "Quotation deleted", 200);
});

const approve = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await quotationService.approveQuotation({
        id,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, item, "Quotation approved", 200);
});

const unapprove = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await quotationService.unapproveQuotation({
        id,
        transaction: req.transaction,
    });
    return responseHandler.sendSuccess(res, item, "Quotation unapproved", 200);
});

const getProjectPrices = asyncHandler(async (req, res) => {
    const items = await quotationService.getProjectPrices({ schemeId: req.body.schemeId });
    return responseHandler.sendSuccess(res, items, "Project prices fetched", 200);
});

const getProjectPriceBomDetails = asyncHandler(async (req, res) => {
    const { id } = req.body;
    const item = await quotationService.getProjectPriceBomDetails({ id });
    if (!item) {
        return responseHandler.sendError(res, "Project price not found", 404);
    }
    return responseHandler.sendSuccess(res, item, "Project price fetched", 200);
});

const getProductMakes = asyncHandler(async (req, res) => {
    const items = await quotationService.getProductMakes();
    if (!items) {
        return responseHandler.sendError(res, "Product makes not found", 404);
    } else {
        for (let index = 0; index < items.length; index++) {
            let element = items[index];
            element.productTypeName = element?.productType?.name?.toLowerCase() || "";
        }
        return responseHandler.sendSuccess(res, items, "Product makes fetched", 200);
    }
});

const getNextQuotationNumber = asyncHandler(async (req, res) => {
    const quotationNumber = await quotationService.getNextQuotationNumber();
    return responseHandler.sendSuccess(res, { quotation_number: quotationNumber }, "Next quotation number generated", 200);
});

const getAllProducts = asyncHandler(async (req, res) => {
    const items = await quotationService.getAllProducts();
    return responseHandler.sendSuccess(res, items, "Products fetched", 200);
});

const getQuotationCountByInquiry = asyncHandler(async (req, res) => {
    const { inquiry_id } = req.query;
    if (!inquiry_id) {
        return responseHandler.sendError(res, "inquiry_id is required", 400);
    }
    const count = await quotationService.getQuotationCountByInquiry({ inquiry_id: parseInt(inquiry_id, 10) });
    return responseHandler.sendSuccess(res, { count }, "Quotation count fetched", 200);
});

const generatePDF = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const fs = require("fs");
    const path = require("path");

    // Get quotation data
    const quotation = await quotationService.getQuotationById({ id });
    if (!quotation) {
        return responseHandler.sendError(res, "Quotation not found", 404);
    }

    // Get company profile
    const { Company, CompanyBankAccount, ProductMake } = db;
    const company = await Company.findOne({ where: { deleted_at: null } });

    // Get primary bank account
    const bankAccount = await CompanyBankAccount.findOne({
        where: { deleted_at: null },
        order: [["created_at", "ASC"]]
    });

    // Get all product makes and create a Map (id -> {name, logo})
    const productMakes = await ProductMake.findAll({
        where: { deleted_at: null },
        attributes: ["id", "name", "logo"]
    });
    const productMakesMap = new Map(
        productMakes.map(pm => [pm.id, { name: pm.name, logo: pm.logo }])
    );

    const bucketClient = bucketService.getBucketForRequest(req);
    // Prepare data for PDF
    const pdfData = await pdfService.prepareQuotationData(
        quotation,
        company ? company.toJSON() : null,
        bankAccount ? bankAccount.toJSON() : null,
        productMakesMap,
        bucketClient
    );

    // Generate PDF buffer
    const pdfBuffer = await pdfService.generateQuotationPDF(pdfData, { bucketClient });

    const filename = `quotation-${quotation.quotation_number || id}.pdf`;

    let uploadResult;
    try {
        uploadResult = await bucketService.uploadFile(
            { buffer: pdfBuffer, originalname: filename, mimetype: "application/pdf", size: pdfBuffer.length },
            { prefix: "quotations/pdfs", acl: "private" },
            bucketClient
        );
    } catch (error) {
        console.error("Error uploading PDF to bucket:", error);
        throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }

    let url;
    try {
        url = await bucketService.getSignedUrl(uploadResult.path, 3600, bucketClient);
    } catch (error) {
        console.error("Error generating signed URL for PDF:", error);
        throw new AppError(FILE_UNAVAILABLE_MESSAGE, 503);
    }

    if (req.tenant?.id) {
      const usageService = require("../billing/usage.service.js");
      usageService.incrementPdfGenerated(req.tenant.id).catch(() => {});
    }
    return responseHandler.sendSuccess(res, {
        path: uploadResult.path,
        filename: filename,
        url,
        expires_in: 3600
    }, "PDF generated successfully", 200);
});

module.exports = {
    list,
    exportList,
    getById,
    create,
    update,
    remove,
    approve,
    unapprove,
    getProjectPrices,
    getProjectPriceBomDetails,
    getProductMakes,
    getNextQuotationNumber,
    getQuotationCountByInquiry,
    getAllProducts,
    generatePDF
};

