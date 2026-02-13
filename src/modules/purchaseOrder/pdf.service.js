"use strict";

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const puppeteerService = require("../../common/services/puppeteer.service.js");
const bucketService = require("../../common/services/bucket.service.js");

const PUBLIC_DIR = path.join(__dirname, "../../../public");

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
 * Build full HTML document for the PO PDF (same structure as sample)
 */
const buildPurchaseOrderHtml = (data) => {
    const rows = data.items
        .map(
            (item) => `
      <tr class="item-row">
        <td>${item.index}</td>
        <td class="item-desc">
          <strong>${escapeHtml(item.name)}</strong>${item.description ? "<br/>" + escapeHtml(item.description) : ""}<br/>
          <b>HSN:</b> ${escapeHtml(item.hsn)}
        </td>
        <td>${item.qty}<br/>${item.unit}</td>
        <td>${item.rate.toFixed(2)}</td>
        <td>${item.cgst.toFixed(2)}</td>
        <td>${item.sgst.toFixed(2)}</td>
        <td>${item.igst.toFixed(2)}</td>
        <td>${item.amount.toFixed(2)}</td>
      </tr>
    `
        )
        .join("");

    const logoBlock = data.company.logo_data_url
        ? `<img src="${data.company.logo_data_url}" alt="${escapeHtml(data.company.name)}" class="company-logo" /><span class="logo-text">${escapeHtml(data.company.name)}</span>`
        : `<span class="logo-text">${escapeHtml(data.company.name)}</span>`;

    return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      :root {
        --po-primary: #059669;
        --po-primary-light: #ecfdf5;
        --po-primary-dark: #065f46;
        --po-muted: #6b7280;
      }

      body {
        font-family: Arial, sans-serif;
        font-size: 12px;
        padding: 30px;
        border: 2px solid var(--po-primary);
        color: #171717;
      }

      .po-main-title {
        text-align: center;
        margin: 0 0 16px 0;
        font-size: 24px;
        font-weight: bold;
        color: var(--po-primary);
      }

      .top-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .logo {
        font-size: 28px;
        font-weight: bold;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 12px;
      }

      .company-logo {
        max-height: 48px;
        max-width: 140px;
        object-fit: contain;
        display: block;
      }

      .logo-text {
        font-size: 20px;
        font-weight: bold;
        color: var(--po-primary);
      }

      .po-title {
        text-align: right;
      }

      .po-title .recipient-label {
        font-size: 11px;
        color: var(--po-muted);
      }

      .po-title .po-meta {
        margin-top: 4px;
      }

      hr {
        margin: 10px 0;
        border: none;
        border-top: 1px solid var(--po-primary);
      }

      .address-section {
        display: flex;
        justify-content: space-between;
        margin-top: 10px;
      }

      .address-box {
        width: 32%;
      }

      table.po-items {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
        font-size: 10px;
        line-height: 1.2;
      }

      table.po-items, table.po-items th, table.po-items td {
        border: 1px solid var(--po-primary-dark);
      }

      table.po-items th, table.po-items td {
        padding: 2px 4px;
        text-align: center;
        vertical-align: top;
      }

      table.po-items th {
        background: var(--po-primary-light);
        color: var(--po-primary-dark);
        font-size: 10px;
      }

      table.po-items .item-row td {
        padding: 2px 4px;
      }

      table.po-items .item-desc {
        text-align: left;
      }

      .summary {
        width: 40%;
        float: right;
        margin-top: 16px;
        font-size: 11px;
        background: var(--po-primary-light);
        border: 1px solid var(--po-primary-dark);
      }

      .summary td {
        text-align: right;
        padding: 2px 6px;
      }

      .summary tr:last-child td {
        font-weight: bold;
        color: var(--po-primary-dark);
      }

      .signature {
        margin-top: 100px;
        display: flex;
        justify-content: space-between;
      }

      .note {
        margin-top: 20px;
        font-size: 11px;
      }

      .amount-words {
        text-align: right;
        margin-top: 10px;
        font-style: italic;
        color: var(--po-primary-dark);
      }
    </style>
  </head>

  <body>

    <h1 class="po-main-title">PURCHASE ORDER</h1>

    <div class="top-header">
      <div class="logo">
        ${logoBlock}
      </div>
      <div class="po-title">
        <div class="recipient-label">Original for Recipient</div>
        <div class="po-meta">
          <div><b>PO No.:</b> ${escapeHtml(data.poNumber)}</div>
          <div><b>Date:</b> ${escapeHtml(data.date)}</div>
          <div><b>Due Date:</b> ${escapeHtml(data.shippingDate)}</div>
        </div>
      </div>
    </div>

    <hr/>

    <div class="address-section">
      <div class="address-box">
        <b>Bill To</b><br/>
        ${escapeHtml(data.company.name)}<br/>
        ${escapeHtml(data.company.address)}<br/>
        ${data.company.phone ? "&#9742; " + escapeHtml(data.company.phone) : ""}<br/>
        ${data.company.email ? "&#9993; " + escapeHtml(data.company.email) : ""}<br/>
        GSTIN: ${escapeHtml(data.company.gstin)}
      </div>

      <div class="address-box">
        <b>Vendor:</b><br/>
        ${escapeHtml(data.vendor.name)}<br/>
        ${escapeHtml(data.vendor.address)}<br/>
        ${data.vendor.phone ? "&#9742; " + escapeHtml(data.vendor.phone) : ""}<br/>
        GSTIN: ${escapeHtml(data.vendor.gstin)}<br/>
        Vendor Code: ${escapeHtml(data.vendor.code)}
      </div>

      <div class="address-box">
        <b>Ship To:</b><br/>
        ${escapeHtml(data.shipTo.name)}<br/>
        ${escapeHtml(data.shipTo.address)}<br/>
        ${data.shipTo.phone ? "&#9742; " + escapeHtml(data.shipTo.phone) : ""}
      </div>
    </div>

    <table class="po-items">
      <thead>
        <tr>
          <th>No</th>
          <th>Product / Service</th>
          <th>Preparation Column</th>
          <th>Purchase Rate</th>
          <th>CGST</th>
          <th>SGST</th>
          <th>IGST</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr>
          <td colspan="4"><b>TOTAL</b></td>
          <td>${data.totalCGST.toFixed(2)}</td>
          <td>${data.totalSGST.toFixed(2)}</td>
          <td>${data.totalIGST.toFixed(2)}</td>
          <td><b>${data.grandTotal.toFixed(2)}</b></td>
        </tr>
      </tbody>
    </table>

    <table class="summary">
      <tr>
        <td>Total Before Tax</td>
        <td>${data.subtotal.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Total Tax Amount</td>
        <td>${data.totalTax.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Rounded Off</td>
        <td>0.00</td>
      </tr>
      <tr>
        <td><b>Total Amount</b></td>
        <td><b>&#8377; ${data.grandTotal.toFixed(2)}</b></td>
      </tr>
    </table>

    <div class="amount-words">
      ${data.amountInWords ? "&#8377; " + escapeHtml(data.amountInWords) : ""}
    </div>

    <div class="signature">
      <div>
        <b>AUTHORIZED SIGNATORY</b>
      </div>
    </div>

    <div class="note">
      <b>NOTE:</b><br/>
      ${escapeHtml(data.note)}
    </div>

  </body>
  </html>
  `;
};

function escapeHtml(text) {
    if (text == null) return "";
    const s = String(text);
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

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
            waitUntil: "networkidle0",
            timeout: 60000,
        });
        return await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
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
