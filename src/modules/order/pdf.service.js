"use strict";

const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const bucketService = require("../../common/services/bucket.service.js");
const puppeteerService = require("../../common/services/puppeteer.service.js");
const { normalizeBomSnapshotForDisplay } = require("../../common/utils/bomUtils.js");

const TEMPLATE_DIR = path.join(__dirname, "../../../templates/order");
const PUBLIC_DIR = path.join(__dirname, "../../../public");

handlebars.registerHelper("safe", function (value) {
    if (value == null) return "-";
    const v = String(value).trim();
    return v === "" ? "-" : v;
});

handlebars.registerHelper("formatDate", function (value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
});

handlebars.registerHelper("formatCurrency", function (value) {
    const n = Number(value);
    if (Number.isNaN(n)) return "Rs. 0";
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(n);
});

handlebars.registerHelper("eq", function (a, b) {
    return String(a) === String(b);
});

handlebars.registerHelper("add", function (a, b) {
    return (Number(a) || 0) + (Number(b) || 0);
});

const loadTemplate = (templatePath) => {
    const fullPath = path.join(TEMPLATE_DIR, templatePath);
    return handlebars.compile(fs.readFileSync(fullPath, "utf-8"));
};

const fileToDataUrl = (filePath, mimeType = "image/jpeg") => {
    try {
        if (!fs.existsSync(filePath)) return "";
        const fileBuffer = fs.readFileSync(filePath);
        return `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
    } catch (error) {
        console.error(`Unable to read file for Order PDF: ${filePath}`, error);
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
        console.error(`Unable to read bucket object for Order PDF: ${pathOrKey}`, error);
        return "";
    }
};

const orderedStages = (stages = {}, currentStageKey = null) => {
    const meta = [
        { key: "estimate_generated", label: "Estimate Generated" },
        { key: "estimate_paid", label: "Estimate Paid" },
        { key: "planner", label: "Planner" },
        { key: "delivery", label: "Delivery" },
        { key: "assign_fabricator_and_installer", label: "Assign Fabricator & Installer" },
        { key: "fabrication", label: "Fabrication" },
        { key: "installation", label: "Installation" },
        { key: "netmeter_apply", label: "Netmeter Apply" },
        { key: "netmeter_installed", label: "Netmeter Installed" },
        { key: "subsidy_claim", label: "Subsidy Claim" },
        { key: "subsidy_disbursed", label: "Subsidy Disbursed" },
    ];
    return meta.map((item) => {
        const status = stages?.[item.key] || "pending";
        return {
            ...item,
            status,
            current: currentStageKey === item.key,
        };
    });
};

const prepareOrderPdfData = async (order, company = null, bankAccount = null, options = {}) => {
    const normalizedBom = Array.isArray(order?.bom_snapshot)
        ? normalizeBomSnapshotForDisplay(order.bom_snapshot)
        : [];
    const companyLogoPath = company?.logo || "";
    const logoExt = path.extname(companyLogoPath || "").toLowerCase();
    const logoMimeType = logoExt === ".png" ? "image/png" : logoExt === ".svg" ? "image/svg+xml" : "image/jpeg";
    const logoDataUrl = companyLogoPath
        ? await pathToDataUrl(companyLogoPath, logoMimeType, options.bucketClient)
        : "";
    return {
        generated_at: new Date(),
        company: {
            name: company?.company_name || "Company",
            email: company?.company_email || "",
            phone: company?.contact_number || "",
            website: company?.company_website || "",
            logo_data_url: logoDataUrl,
        },
        bank: bankAccount
            ? {
                bank_name: bankAccount.bank_name || "",
                account_name: bankAccount.bank_account_name || "",
                account_number: bankAccount.bank_account_number || "",
                ifsc: bankAccount.bank_account_ifsc || "",
                branch: bankAccount.bank_account_branch || "",
                upi_id: bankAccount.upi_id || "",
            }
            : null,
        order: {
            ...order,
            stages_list: orderedStages(order?.stages, order?.current_stage_key),
            bom_snapshot: normalizedBom,
        },
    };
};

const buildOrderHtmlDocument = async (data) => {
    const styles = fs.readFileSync(path.join(TEMPLATE_DIR, "styles/order.css"), "utf-8");
    const summaryTemplate = loadTemplate("partials/order-summary.hbs");
    const bomTemplate = loadTemplate("partials/order-bom.hbs");
    const mainTemplate = loadTemplate("order.hbs");

    const summary = summaryTemplate(data);
    const bom = bomTemplate(data);

    return mainTemplate({
        ...data,
        styles,
        summary,
        bom,
    });
};

const generateOrderPDF = async (data) => {
    let browser = null;
    try {
        const html = await buildOrderHtmlDocument(data);
        browser = await puppeteer.launch(puppeteerService.getLaunchOptions());
        const page = await browser.newPage();
        await page.setContent(html, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });
        return await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "10mm", right: "10mm", bottom: "12mm", left: "10mm" },
            timeout: 60000,
        });
    } finally {
        if (browser) await browser.close();
    }
};

module.exports = {
    prepareOrderPdfData,
    buildOrderHtmlDocument,
    generateOrderPDF,
};

