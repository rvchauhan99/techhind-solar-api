"use strict";

const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const bucketService = require("../../common/services/bucket.service.js");
const puppeteerService = require("../../common/services/puppeteer.service.js");

const TEMPLATE_DIR = path.join(__dirname, "../../../templates/b2b-shipment");
const PUBLIC_DIR = path.join(__dirname, "../../../public");

const loadTemplate = (templatePath) => {
  const absolutePath = path.join(TEMPLATE_DIR, templatePath);
  const templateContent = fs.readFileSync(absolutePath, "utf-8");
  return handlebars.compile(templateContent);
};

handlebars.registerHelper("safe", (value) => {
  if (value == null) return "-";
  const v = String(value).trim();
  return v === "" ? "-" : v;
});
handlebars.registerHelper("formatDate", (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
});

const pathToDataUrl = async (pathOrKey, mimeType, bucketClient) => {
  if (!pathOrKey) return "";
  if (pathOrKey.startsWith("/")) {
    const fp = path.join(PUBLIC_DIR, pathOrKey);
    if (!fs.existsSync(fp)) return "";
    const buf = fs.readFileSync(fp);
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  }
  try {
    const obj = bucketClient
      ? await bucketService.getObjectWithClient(bucketClient, pathOrKey)
      : await bucketService.getObject(pathOrKey);
    const ct = obj.contentType || mimeType;
    const b64 = Buffer.isBuffer(obj.body) ? obj.body.toString("base64") : Buffer.from(obj.body).toString("base64");
    return `data:${ct};base64,${b64}`;
  } catch {
    return "";
  }
};

const toItemLine = (rawItem = {}, index = 0) => {
  const product = rawItem.product || {};
  const quantity = Number(rawItem.quantity) || 0;
  const serialsRaw = rawItem.serials || "";
  const serialNumbers = serialsRaw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return {
    index: index + 1,
    hsn: product.hsn_ssn_code || "-",
    product_name: product.product_name || "-",
    product_type: product.productType?.name || "Other",
    description: product.product_description || rawItem.remarks || "",
    quantity,
    uom: product.measurementUnit?.unit || "Nos",
    serial_numbers: serialNumbers,
    serial_numbers_display: serialNumbers.length > 0 ? serialNumbers.join(", ") : "-",
  };
};

const groupItems = (items = []) => {
  const map = {};
  const order = [];
  items.forEach((it) => {
    const name = String(it.product_type || "Other").trim() || "Other";
    if (!map[name]) {
      map[name] = [];
      order.push(name);
    }
    map[name].push(it);
  });
  return order.map((group_name) => {
    const groupItemsList = map[group_name] || [];
    const group_qty = groupItemsList.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    return { group_name, group_qty, items: groupItemsList };
  });
};

const prepareB2BShipmentPdfData = async (shipment, company, options = {}) => {
  const client = shipment.client || {};
  const shipTo = shipment.shipTo || null;
  const warehouse = shipment.warehouse || {};
  const salesOrder = shipment.salesOrder || {};
  const itemLines = Array.isArray(shipment.items)
    ? shipment.items.map((item, idx) => toItemLine(item, idx))
    : [];
  const itemsWithSerials = itemLines.filter((line) => line.serial_numbers && line.serial_numbers.length > 0);
  const totalQuantity = itemLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);

  let logoDataUrl = "";
  if (company?.logo && options.bucketClient) {
    const ext = path.extname(company.logo || "").toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
    logoDataUrl = await pathToDataUrl(company.logo, mime, options.bucketClient);
  }

  const customer = shipTo
    ? { name: shipTo.ship_to_name || client.client_name, address: shipTo.address, mobile: shipTo.phone }
    : { name: client.client_name, address: client.billing_address, mobile: client.phone };

  return {
    generated_at: new Date(),
    company: {
      name: company?.company_name || "Company",
      address: [company?.address, company?.city, company?.state].filter(Boolean).join(", "),
      phone: company?.contact_number,
      email: company?.company_email,
      website: company?.company_website || "",
      logo_data_url: logoDataUrl,
    },
    shipment: {
      shipment_no: shipment.shipment_no,
      shipment_date: shipment.shipment_date,
      transporter: shipment.transporter,
      vehicle_number: shipment.vehicle_number,
      lr_number: shipment.lr_number,
      remarks: shipment.remarks,
    },
    warehouse: { name: warehouse.name, address: warehouse.address },
    customer,
    order: { order_number: salesOrder.order_no },
    items: itemLines,
    items_grouped: groupItems(itemLines),
    items_with_serials: itemsWithSerials,
    total_quantity: totalQuantity,
    generated_by: options.generatedBy || "-",
    copies: ["Original", "Duplicate"],
  };
};

const buildB2BShipmentHtmlDocument = async (data) => {
  const styles = fs.readFileSync(path.join(TEMPLATE_DIR, "styles/b2b-shipment.css"), "utf-8");
  const copyTemplate = loadTemplate("partials/b2b-shipment-copy.hbs");
  const mainTemplate = loadTemplate("b2b-shipment.hbs");
  const labels = data.copies || ["Original", "Duplicate"];
  const copies = labels.map((copyLabel, index) =>
    copyTemplate({
      ...data,
      copyLabel,
      isLastCopy: index === labels.length - 1,
    })
  );
  return mainTemplate({
    ...data,
    styles,
    copies,
  });
};

const generateB2BShipmentPDF = async (data) => {
  let browser = null;
  try {
    const html = await buildB2BShipmentHtmlDocument(data);
    browser = await puppeteer.launch(puppeteerService.getLaunchOptions());
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 60000 });
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
  prepareB2BShipmentPdfData,
  buildB2BShipmentHtmlDocument,
  generateB2BShipmentPDF,
};
