"use strict";

const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const puppeteerService = require("../../common/services/puppeteer.service.js");
const bucketService = require("../../common/services/bucket.service.js");

const PUBLIC_DIR = path.join(__dirname, "../../../public");
const TEMPLATE_DIR = path.join(__dirname, "../../../templates/purchase-order");
const STYLES_PATH = path.join(TEMPLATE_DIR, "styles/purchase-order.css");

const fileToDataUrl = (filePath, mimeType = "image/jpeg") => {
    try {
        if (!fs.existsSync(filePath)) return "";
        const fileBuffer = fs.readFileSync(filePath);
        return `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
    } catch (error) {
        console.error(`Unable to read file for PO PDF: ${filePath}`, error);
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
        console.error(`Unable to read bucket object for PO PDF: ${pathOrKey}`, error);
        return "";
    }
};

/**
 * Format date as "September 26, 2017"
 */
const formatDateLong = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const safe = (value) => (value != null && String(value).trim() !== "" ? String(value).trim() : "");

handlebars.registerHelper("safe", (value) => {
    if (value == null) return "-";
    const v = String(value).trim();
    return v === "" ? "-" : v;
});
handlebars.registerHelper("formatCurrency", (value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return "0.00";
    return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
});

/**
 * Build vendor address from supplier (address, city, state if available)
 */
const formatSupplierAddress = (supplier) => {
    if (!supplier) return "";
    const parts = [supplier.address, supplier.city].filter(Boolean);
    return parts.join(", ") || "";
};

/**
 * Build ship-to / bill-to address lines
 */
const formatAddress = (obj, addressKey = "address") => {
    if (!obj) return "";
    const addr = obj[addressKey];
    const cityState = [obj.city, obj.state].filter(Boolean).join(", ");
    if (addr && cityState) return `${addr}, ${cityState}`;
    return addr || cityState || "";
};

/**
 * Prepare PO data for PDF: map DB model to the shape expected by the HTML template.
 * Items: we have gst_percent; sample expects cgst, sgst, igst. We use intra-state: CGST = SGST = gst_percent/2, IGST = 0.
 * Resolves company logo to data URL when options.bucketClient is provided.
 */
const preparePurchaseOrderPdfData = async (po, options = {}) => {
    const items = (po.items || []).map((item, index) => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const amountExcludingGst = Number(item.amount_excluding_gst) != null ? Number(item.amount_excluding_gst) : qty * rate;
        const totalAmount = Number(item.amount) != null ? Number(item.amount) : amountExcludingGst * (1 + (Number(item.gst_percent) || 0) / 100);
        const taxAmount = totalAmount - amountExcludingGst;
        const cgst = taxAmount / 2;
        const sgst = taxAmount / 2;
        const igst = 0;
        const name = item.product?.product_name || "Item";
        const description = item.product?.product_description || "";
        const hsn = item.hsn_code || item.product?.hsn_ssn_code || "";
        const unit = "Pcs";

        return {
            index: index + 1,
            name,
            description,
            hsn,
            qty,
            unit,
            rate,
            cgst,
            sgst,
            igst,
            amount: totalAmount,
            amountExcludingGst,
        };
    });

    let subtotal = 0;
    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;
    items.forEach((item) => {
        subtotal += item.amountExcludingGst;
        totalCGST += item.cgst;
        totalSGST += item.sgst;
        totalIGST += item.igst;
    });
    const totalTax = totalCGST + totalSGST + totalIGST;
    const grandTotal = subtotal + totalTax;

    let logoDataUrl = "";
    if (po.billTo?.logo && options.bucketClient) {
        const logoPath = po.billTo.logo;
        const logoExt = path.extname(logoPath || "").toLowerCase();
        const logoMimeType = logoExt === ".png" ? "image/png" : logoExt === ".svg" ? "image/svg+xml" : "image/jpeg";
        logoDataUrl = await pathToDataUrl(logoPath, logoMimeType, options.bucketClient);
    } else if (po.billTo?.logo && String(po.billTo.logo).startsWith("/")) {
        const logoPath = path.join(PUBLIC_DIR, po.billTo.logo);
        const logoExt = path.extname(logoPath || "").toLowerCase();
        const logoMimeType = logoExt === ".png" ? "image/png" : logoExt === ".svg" ? "image/svg+xml" : "image/jpeg";
        logoDataUrl = fileToDataUrl(logoPath, logoMimeType);
    }

    const company = po.billTo
        ? {
            name: safe(po.billTo.company_name) || "Company",
            address: formatAddress(po.billTo),
            phone: safe(po.billTo.contact_number),
            email: safe(po.billTo.company_email),
            gstin: safe(po.billTo.gstin) || "-",
            logo_data_url: logoDataUrl,
        }
        : { name: "Company", address: "", phone: "", email: "", gstin: "-", logo_data_url: "" };

    const vendor = po.supplier
        ? {
            name: safe(po.supplier.supplier_name),
            address: formatSupplierAddress(po.supplier),
            phone: safe(po.supplier.phone),
            gstin: safe(po.supplier.gstin) || "-",
            code: safe(po.supplier.supplier_code),
        }
        : { name: "", address: "", phone: "", gstin: "-", code: "" };

    const shipTo = po.shipTo
        ? {
            name: safe(po.shipTo.name),
            address: safe(po.shipTo.address),
            phone: safe(po.shipTo.mobile) || safe(po.shipTo.contact_person) || "",
        }
        : { name: "", address: "", phone: "" };

    return {
        poNumber: safe(po.po_number) || "—",
        date: formatDateLong(po.po_date),
        shippingDate: formatDateLong(po.due_date),
        company,
        vendor,
        shipTo,
        items,
        subtotal,
        totalCGST,
        totalSGST,
        totalIGST,
        totalTax,
        grandTotal,
        amountInWords: safe(po.amount_in_words) || "",
        note: safe(po.remarks) || "Please deliver as per terms.",
    };
};

/**
 * Build full HTML document for the PO PDF using Handlebars template (same format as b2b-sales-order / delivery challan).
 */
const buildPurchaseOrderHtml = (data) => {
    const styles = fs.readFileSync(STYLES_PATH, "utf-8");
    const templatePath = path.join(TEMPLATE_DIR, "purchase-order.hbs");
    const templateString = fs.readFileSync(templatePath, "utf-8");
    const compiled = handlebars.compile(templateString);
    return compiled({ ...data, styles });
};

/**
 * Generate PDF buffer from prepared data (same pattern as order/challan PDF)
 */
const generatePurchaseOrderPDF = async (data) => {
    let browser = null;
    try {
        const html = buildPurchaseOrderHtml(data);
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
    preparePurchaseOrderPdfData,
    buildPurchaseOrderHtml,
    generatePurchaseOrderPDF,
};
