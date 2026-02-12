"use strict";

const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const bucketService = require("../../common/services/bucket.service.js");
const puppeteerService = require("../../common/services/puppeteer.service.js");

const TEMPLATE_DIR = path.join(__dirname, "../../../templates/challan");
const PUBLIC_DIR = path.join(__dirname, "../../../public");

handlebars.registerHelper("safe", function (value) {
    if (value == null) return "-";
    const normalized = String(value).trim();
    return normalized === "" ? "-" : normalized;
});

handlebars.registerHelper("formatDate", function (value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
});

handlebars.registerHelper("add", function (a, b) {
    return (Number(a) || 0) + (Number(b) || 0);
});

const loadTemplate = (templatePath) => {
    const absolutePath = path.join(TEMPLATE_DIR, templatePath);
    const templateContent = fs.readFileSync(absolutePath, "utf-8");
    return handlebars.compile(templateContent);
};

const fileToDataUrl = (filePath, mimeType = "image/jpeg") => {
    try {
        if (!fs.existsSync(filePath)) return "";
        const fileBuffer = fs.readFileSync(filePath);
        return `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
    } catch (error) {
        console.error(`Unable to read file for PDF: ${filePath}`, error);
        return "";
    }
};

const pathToDataUrl = async (pathOrKey, mimeType = "image/jpeg", bucketClient) => {
    if (!pathOrKey) return "";
    if (pathOrKey.startsWith("/")) {
        return fileToDataUrl(path.join(PUBLIC_DIR, pathOrKey), mimeType);
    }
    try {
        const object = bucketClient
            ? await bucketService.getObjectWithClient(bucketClient, pathOrKey)
            : await bucketService.getObject(pathOrKey);
        const contentType = object.contentType || mimeType;
        const base64 = Buffer.isBuffer(object.body)
            ? object.body.toString("base64")
            : Buffer.from(object.body).toString("base64");
        return `data:${contentType};base64,${base64}`;
    } catch (error) {
        console.error(`Unable to read bucket object for PDF: ${pathOrKey}`, error);
        return "";
    }
};

const compactAddress = (...parts) =>
    parts
        .flatMap((part) => String(part || "").split(","))
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ");

const toItemLine = (rawItem = {}, index = 0) => {
    const product = rawItem.product || {};
    const snapshot = rawItem.product_snapshot || {};
    const quantity = Number(rawItem.quantity) || 0;
    return {
        index: index + 1,
        hsn: product.hsn_ssn_code || snapshot.hsn_ssn_code || "-",
        product_name: product.product_name || snapshot.product_name || "-",
        description: product.product_description || snapshot.product_description || rawItem.remarks || "",
        quantity,
        uom: product.measurementUnit?.unit || snapshot.uom || "Nos",
    };
};

const prepareChallanPdfData = async (challan, company, options = {}) => {
    const order = challan?.order || {};
    const customer = order?.customer || {};
    const warehouse = challan?.warehouse || {};
    const generatedBy = options.generatedBy || order?.handledBy?.name || "-";
    const itemLines = Array.isArray(challan?.items)
        ? challan.items.map((item, index) => toItemLine(item, index))
        : [];
    const totalQuantity = itemLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    const companyLogoPath = company?.logo || "";
    const logoExt = path.extname(companyLogoPath || "").toLowerCase();
    const logoMimeType = logoExt === ".png" ? "image/png" : logoExt === ".svg" ? "image/svg+xml" : "image/jpeg";
    const logoDataUrl = companyLogoPath
        ? await pathToDataUrl(companyLogoPath, logoMimeType, options.bucketClient)
        : "";

    return {
        generated_at: new Date(),
        company: {
            name: company?.company_name || "",
            address: compactAddress(company?.address, company?.city, company?.state),
            contact_number: company?.contact_number || "",
            email: company?.company_email || "",
            website: company?.company_website || "",
            logo_data_url: logoDataUrl,
        },
        warehouse: {
            name: warehouse?.name || "",
            contact_person: warehouse?.contact_person || "",
            mobile: warehouse?.mobile || "",
            phone_no: warehouse?.phone_no || "",
            email: warehouse?.email || "",
            address: compactAddress(warehouse?.address),
        },
        customer: {
            name: customer?.customer_name || "",
            mobile: customer?.mobile_number || customer?.phone_no || "",
            address: compactAddress(
                customer?.address,
                customer?.landmark_area,
                customer?.taluka,
                customer?.district
            ),
        },
        challan: {
            id: challan?.id,
            challan_no: challan?.challan_no || challan?.id,
            challan_date: challan?.challan_date,
            transporter: challan?.transporter || "",
            remarks: challan?.remarks || "",
        },
        order: {
            id: order?.id,
            order_number: order?.order_number || "-",
            consumer_no: order?.consumer_no || "",
            capacity: order?.capacity,
        },
        generated_by: generatedBy,
        items: itemLines,
        total_quantity: totalQuantity,
        copies: ["Original", "Duplicate"],
    };
};

const buildChallanHtmlDocument = async (data) => {
    const styles = fs.readFileSync(path.join(TEMPLATE_DIR, "styles/challan.css"), "utf-8");
    const copyTemplate = loadTemplate("partials/challan-copy.hbs");
    const mainTemplate = loadTemplate("challan.hbs");
    const copies = (data.copies || ["Original", "Duplicate"]).map((copyLabel, index) =>
        copyTemplate({
            ...data,
            copyLabel,
            isLastCopy: index === (data.copies || []).length - 1,
        })
    );
    return mainTemplate({
        ...data,
        styles,
        copies,
    });
};

const generateChallanPDF = async (data) => {
    let browser = null;
    try {
        const html = await buildChallanHtmlDocument(data);
        browser = await puppeteer.launch(puppeteerService.getLaunchOptions());
        const page = await browser.newPage();
        await page.setContent(html, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });
        return await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "10mm",
                right: "8mm",
                bottom: "10mm",
                left: "8mm",
            },
            timeout: 60000,
        });
    } finally {
        if (browser) await browser.close();
    }
};

module.exports = {
    prepareChallanPdfData,
    buildChallanHtmlDocument,
    generateChallanPDF,
};
