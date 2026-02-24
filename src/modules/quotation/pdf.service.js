"use strict";

const puppeteer = require("puppeteer");
const handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const bucketService = require("../../common/services/bucket.service.js");
const puppeteerService = require("../../common/services/puppeteer.service.js");
const { normalizeBomSnapshotForDisplay } = require("../../common/utils/bomUtils.js");

// Template directory paths
const TEMPLATE_DIR = path.join(__dirname, "../../../templates/quotation");
const PUBLIC_DIR = path.join(__dirname, "../../../public");

/**
 * Register Handlebars helpers
 */
handlebars.registerHelper("formatCurrency", function (value) {
    if (value === null || value === undefined || value === "") {
        return "0.00";
    }
    const num = parseFloat(value);
    if (isNaN(num)) {
        return value; // Return as-is if not a number (e.g., "As Actual")
    }
    return num.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
});

handlebars.registerHelper("formatDate", function (date) {
    if (!date) return "";
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
});

handlebars.registerHelper("add", function (a, b) {
    return (Number(a) || 0) + (Number(b) || 0);
});

/**
 * Load and compile a template file
 * @param {string} templatePath - Relative path from template directory
 * @returns {Function} Compiled Handlebars template
 */
const loadTemplate = (templatePath) => {
    const fullPath = path.join(TEMPLATE_DIR, templatePath);
    const templateContent = fs.readFileSync(fullPath, "utf-8");
    return handlebars.compile(templateContent);
};

/**
 * Read file as base64 data URL (local filesystem)
 * @param {string} filePath - Absolute path to file
 * @param {string} mimeType - MIME type of the file
 * @returns {string} Base64 data URL
 */
const fileToDataUrl = (filePath, mimeType = "image/jpeg") => {
    try {
        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath}`);
            return "";
        }
        const fileBuffer = fs.readFileSync(filePath);
        const base64 = fileBuffer.toString("base64");
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return "";
    }
};

/**
 * Resolve path to base64 data URL: bucket key, legacy /uploads/ path, or full URL
 * @param {string} pathOrKey - Bucket key (no leading /), legacy path (e.g. /uploads/logo.png), or http(s) URL
 * @param {string} mimeType - MIME type fallback
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @returns {Promise<string>} Base64 data URL
 */
const pathToDataUrl = async (pathOrKey, mimeType = "image/jpeg", bucketClient) => {
    if (!pathOrKey) return "";
    if (pathOrKey.startsWith("/")) {
        const absolutePath = path.join(PUBLIC_DIR, pathOrKey);
        return fileToDataUrl(absolutePath, mimeType);
    }
    if (pathOrKey.startsWith("http://") || pathOrKey.startsWith("https://")) {
        try {
            const https = require("https");
            const http = require("http");
            const protocol = pathOrKey.startsWith("https") ? https : http;
            const { buf, contentType: resolvedType } = await new Promise((resolve, reject) => {
                protocol.get(pathOrKey, (res) => {
                    const chunks = [];
                    res.on("data", (chunk) => chunks.push(chunk));
                    res.on("end", () => {
                        const buf = Buffer.concat(chunks);
                        const ct = res.headers["content-type"] || "";
                        const contentType = /image\/png/i.test(ct) ? "image/png"
                            : /image\/svg/i.test(ct) ? "image/svg+xml"
                            : (buf[0] === 0x89 && buf[1] === 0x50) ? "image/png"
                            : mimeType;
                        resolve({ buf, contentType });
                    });
                    res.on("error", reject);
                }).on("error", reject);
            });
            const base64 = buf.toString("base64");
            return `data:${resolvedType};base64,${base64}`;
        } catch (err) {
            console.error(`Error fetching logo URL ${pathOrKey}:`, err);
            return "";
        }
    }
    const tryFetch = async (client) => {
        try {
            const result = client
                ? await bucketService.getObjectWithClient(client, pathOrKey)
                : await bucketService.getObject(pathOrKey);
            const body = result.body;
            const contentType = result.contentType || mimeType;
            const base64 = Buffer.isBuffer(body) ? body.toString("base64") : Buffer.from(body).toString("base64");
            return `data:${contentType};base64,${base64}`;
        } catch (e) {
            return null;
        }
    };
    let dataUrl = await tryFetch(bucketClient);
    if (!dataUrl && bucketClient) {
        try {
            dataUrl = await tryFetch(null);
        } catch (_) { /* ignore */ }
    }
    if (!dataUrl) {
        console.error(`Error reading from bucket: ${pathOrKey}`);
        return "";
    }
    return dataUrl;
};

/**
 * Generate QR code as data URL
 * @param {string} data - Data to encode in QR code
 * @returns {Promise<string>} Base64 data URL of QR code
 */
const generateQRCode = async (data) => {
    try {
        if (!data) return "";
        return await QRCode.toDataURL(data, {
            width: 150,
            margin: 1,
            color: {
                dark: "#000000",
                light: "#ffffff",
            },
        });
    } catch (error) {
        console.error("Error generating QR code:", error);
        return "";
    }
};

/**
 * Build the complete HTML document from templates
 * @param {Object} data - Quotation data
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @returns {Promise<string>} Complete HTML string
 */
const buildHtmlDocument = async (data, bucketClient) => {
    // Load CSS
    const cssPath = path.join(TEMPLATE_DIR, "styles/quotation.css");
    const styles = fs.readFileSync(cssPath, "utf-8");

    // Load partial templates
    const page1Template = loadTemplate("partials/page1-cover.hbs");
    const page2Template = loadTemplate("partials/page2-welcome.hbs");
    const page3Template = loadTemplate("partials/page3-about.hbs");
    const page4Template = loadTemplate("partials/page4-offer.hbs");
    const page5Template = loadTemplate("partials/page5-bom.hbs");
    const page6Template = loadTemplate("partials/page6-savings.hbs");
    const page7Template = loadTemplate("partials/page7-timeline.hbs");
    const page8Template = loadTemplate("partials/page8-terms.hbs");
    const page9Template = loadTemplate("partials/page9-thankyou.hbs");
    const mainTemplate = loadTemplate("quotation.hbs");

    // Prepare image data URLs
    const backgroundImagePath = path.join(PUBLIC_DIR, "solar-background.jpg");
    const backgroundImage = fileToDataUrl(backgroundImagePath, "image/jpeg");

    // Helper to resolve branding image from path (bucket key or legacy path)
    const resolveBrandingImage = async (pathOrKey, fallbackPaths = []) => {
        if (pathOrKey) {
            const ext = path.extname(pathOrKey).toLowerCase();
            const mimeType = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
            const dataUrl = await pathToDataUrl(pathOrKey, mimeType, bucketClient);
            if (dataUrl) return dataUrl;
        }
        for (const fp of fallbackPaths) {
            if (fs.existsSync(fp)) {
                const ext = path.extname(fp).toLowerCase();
                const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
                return fileToDataUrl(fp, mimeType);
            }
        }
        return "";
    };

    // Logo - company profile, then bundled defaults
    const defaultLogoPaths = [
        path.join(PUBLIC_DIR, "logo.png"),
        path.join(PUBLIC_DIR, "solar-earth-logo.png"),
    ];
    const logoImage = await resolveBrandingImage(data.companyLogoPath, defaultLogoPaths);

    // Header, footer, stamp - company profile only (no fallbacks)
    const headerImage = await resolveBrandingImage(data.companyHeaderPath, []);
    const footerImage = await resolveBrandingImage(data.companyFooterPath, []);
    const stampImage = await resolveBrandingImage(data.companyStampPath, []);

    // Generate QR code for UPI payment
    const upiString = data.bank
        ? `upi://pay?pa=${data.bank.upi_id || ""}&cu=INR`
        : "";
    const qrCodeImage = await generateQRCode(upiString);

    // Payment logos - load from templates/quotation/assets folder (tracked by git)
    const paymentLogosDir = path.join(TEMPLATE_DIR, "assets", "payment-logos");
    const gpayLogo = fs.existsSync(path.join(paymentLogosDir, "gpay.png"))
        ? fileToDataUrl(path.join(paymentLogosDir, "gpay.png"), "image/png")
        : "";
    const paytmLogo = fs.existsSync(path.join(paymentLogosDir, "paytm.png"))
        ? fileToDataUrl(path.join(paymentLogosDir, "paytm.png"), "image/png")
        : "";
    const phonepeLogo = fs.existsSync(path.join(paymentLogosDir, "phonepe.png"))
        ? fileToDataUrl(path.join(paymentLogosDir, "phonepe.png"), "image/png")
        : "";
    const amazonPayLogo = fs.existsSync(
        path.join(paymentLogosDir, "amazonpay.png")
    )
        ? fileToDataUrl(path.join(paymentLogosDir, "amazonpay.png"), "image/png")
        : "";
    const upiLogoImage = fs.existsSync(path.join(paymentLogosDir, "bhim-upi.png"))
        ? fileToDataUrl(path.join(paymentLogosDir, "bhim-upi.png"), "image/png")
        : "";

    // Prepare template data with images and branding
    const templateData = {
        ...data,
        backgroundImage,
        logoImage,
        branding: {
            logoImage,
            headerImage,
            footerImage,
            stampImage,
        },
        qrCodeImage,
        gpayLogo,
        paytmLogo,
        phonepeLogo,
        amazonPayLogo,
        upiLogoImage,
    };

    // Render each page partial
    const page1 = page1Template(templateData);
    const page2 = page2Template(templateData);
    const page3 = page3Template(templateData);
    const page4 = page4Template(templateData);
    const page5 = page5Template(templateData);
    const page6 = page6Template(templateData);
    const page7 = page7Template(templateData);
    const page8 = page8Template(templateData);
    const page9 = page9Template(templateData);

    // Render main template with all pages
    const html = mainTemplate({
        ...templateData,
        styles,
        page1,
        page2,
        page3,
        page4,
        page5,
        page6,
        page7,
        page8,
        page9,
    });

    return html;
};

/**
 * Generate PDF from quotation data
 * @param {Object} quotationData - Complete quotation data object
 * @param {{ bucketClient?: { s3: object, bucketName: string } }} [options] - Optional tenant bucket client
 * @returns {Promise<Buffer>} PDF file as buffer
 */
const generateQuotationPDF = async (quotationData, options = {}) => {
    const { bucketClient } = options;
    let browser = null;

    try {
        // Build HTML document
        const html = await buildHtmlDocument(quotationData, bucketClient);

        // Debug: Save HTML to file for inspection
        const debugHtmlPath = path.join(PUBLIC_DIR, "pdfs", "debug-quotation.html");
        const pdfsDir = path.join(PUBLIC_DIR, "pdfs");
        if (!fs.existsSync(pdfsDir)) {
            fs.mkdirSync(pdfsDir, { recursive: true });
        }
        fs.writeFileSync(debugHtmlPath, html);
        console.log("Debug HTML saved to:", debugHtmlPath);

        // Launch Puppeteer (Chrome/Chromium path resolved via common service)
        browser = await puppeteer.launch(puppeteerService.getLaunchOptions());

        const page = await browser.newPage();

        // Set content - only wait for domcontentloaded since we use base64 embedded images
        await page.setContent(html, {
            waitUntil: "domcontentloaded",
            timeout: 60000, // 60 seconds timeout
        });

        // Generate PDF
        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            preferCSSPageSize: true,
            margin: {
                top: "0",
                right: "0",
                bottom: "0",
                left: "0",
            },
            timeout: 60000, // 60 seconds timeout for PDF generation
        });

        return pdfBuffer;
    } catch (error) {
        console.error("Error generating PDF:", error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

/**
 * Get make names from IDs array
 * @param {Array|null} makeIds - Array of ProductMake IDs
 * @param {Map} productMakesMap - Map of ID to {name, logo}
 * @returns {string} Names joined by " / " or empty string
 */
const getMakeNames = (makeIds, productMakesMap) => {
    if (!makeIds || !Array.isArray(makeIds) || makeIds.length === 0) {
        return "";
    }
    const names = makeIds
        .map(id => {
            const make = productMakesMap.get(parseInt(id));
            return make ? make.name : null;
        })
        .filter(name => name); // Filter out undefined/null
    return names.join(" / ");
};

/**
 * Get make logos as base64 data URLs from IDs array (supports bucket key or legacy path)
 * @param {Array|null} makeIds - Array of ProductMake IDs
 * @param {Map} productMakesMap - Map of ID to {name, logo}
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @returns {Promise<Array>} Array of objects with name and logoDataUrl
 */
const getMakeLogos = async (makeIds, productMakesMap, bucketClient) => {
    if (!makeIds || !Array.isArray(makeIds) || makeIds.length === 0) {
        return [];
    }
    const logos = [];
    for (const id of makeIds) {
        const make = productMakesMap.get(parseInt(id));
        if (make && make.logo) {
            const ext = path.extname(make.logo).toLowerCase();
            const mimeType = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
            const logoDataUrl = await pathToDataUrl(make.logo, mimeType, bucketClient);
            if (logoDataUrl) {
                logos.push({
                    name: make.name,
                    logo: logoDataUrl
                });
            }
        }
    }
    return logos;
};

const normType = (s) => (s || "").toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");

/**
 * Derive BOM section data (panel, inverter, structure, cables, balance_of_system, etc.)
 * from normalized bom_snapshot so the section-based PDF layout can be populated when
 * quotation has bom_snapshot but flat fields are empty.
 * @param {Array} normalizedBomSnapshot - Array of flat BOM lines (product_type_name, product_make_name, capacity, quantity, etc.)
 * @param {Map} productMakesMap - Map of ProductMake ID to { name, logo }
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @returns {Promise<Object>} Section objects: panel, inverter, hybrid_inverter, battery, cables, structure, balance_of_system
 */
const deriveBomSectionsFromSnapshot = async (normalizedBomSnapshot, productMakesMap, bucketClient) => {
    if (!Array.isArray(normalizedBomSnapshot) || normalizedBomSnapshot.length === 0) {
        return null;
    }

    const emptyPanel = () => ({ watt_peak: 0, quantity: 0, type: "", make: "", warranty: 0, performance_warranty: 0, make_logos: [] });
    const emptyInverter = () => ({ size: 0, quantity: 0, make: "", warranty: 0, make_logos: [] });
    const emptyHybridInverter = () => ({ size: 0, quantity: 0, make: "", warranty: "", make_logos: [] });
    const emptyBattery = () => ({ size: 0, quantity: 0, type: "", make: "", warranty: "", make_logos: [] });
    const emptyCables = () => ({
        ac_cable_make: "", ac_cable_qty: "", ac_cable_description: "",
        dc_cable_make: "", dc_cable_qty: "", dc_cable_description: "",
        earthing_make: "", earthing_qty: "", earthing_description: "",
        la_make: "", la_qty: "", la_description: "",
    });
    const emptyStructure = () => ({ height: "", material: "", warranty: 0 });
    const emptyBos = () => ({ acdb: "", dcdb: "", earthing: "", lightening_arrestor: "", miscellaneous: "" });

    const panel = emptyPanel();
    const inverter = emptyInverter();
    const hybrid_inverter = emptyHybridInverter();
    const battery = emptyBattery();
    const cables = emptyCables();
    const structure = emptyStructure();
    const balance_of_system = emptyBos();

    const panelMakeIds = [];
    const inverterMakeIds = [];
    const hybridInverterMakeIds = [];
    const batteryMakeIds = [];

    const capNum = (v) => (v != null && !Number.isNaN(parseFloat(v))) ? parseFloat(v) : 0;
    const qtyNum = (v) => (v != null && !Number.isNaN(parseFloat(v))) ? parseFloat(v) : 0;
    const str = (v) => (v != null && String(v).trim() !== "") ? String(v).trim() : "";

    for (const line of normalizedBomSnapshot) {
        const typeNorm = normType(line.product_type_name);
        const makeName = str(line.product_make_name);
        const makeId = line.product_make_id != null ? parseInt(line.product_make_id, 10) : null;
        const qty = qtyNum(line.quantity);
        const capacity = capNum(line.capacity);
        const productName = str(line.product_name);
        const unit = line.measurement_unit_name ? String(line.measurement_unit_name).trim() : "";

        if (typeNorm === "panel") {
            panel.watt_peak = capacity || panel.watt_peak;
            panel.quantity = qty || panel.quantity;
            if (productName) panel.type = productName;
            if (makeName) panel.make = makeName;
            if (makeId && !Number.isNaN(makeId)) panelMakeIds.push(makeId);
        } else if (typeNorm === "inverter") {
            inverter.size = capacity || inverter.size;
            inverter.quantity = qty || inverter.quantity;
            if (makeName) inverter.make = makeName;
            if (makeId && !Number.isNaN(makeId)) inverterMakeIds.push(makeId);
        } else if (typeNorm === "hybrid_inverter" || typeNorm === "hybridinverter") {
            hybrid_inverter.size = capacity || hybrid_inverter.size;
            hybrid_inverter.quantity = qty || hybrid_inverter.quantity;
            if (makeName) hybrid_inverter.make = makeName;
            if (makeId && !Number.isNaN(makeId)) hybridInverterMakeIds.push(makeId);
        } else if (typeNorm === "battery") {
            battery.size = capacity || battery.size;
            battery.quantity = qty || battery.quantity;
            if (productName) battery.type = productName;
            if (makeName) battery.make = makeName;
            if (makeId && !Number.isNaN(makeId)) batteryMakeIds.push(makeId);
        } else if (typeNorm === "structure") {
            structure.height = (qty != null && qty > 0) ? String(qty) : (structure.height || productName || "");
            if (productName && !structure.material) structure.material = productName;
        } else if (typeNorm === "ac_cable") {
            cables.ac_cable_make = makeName || cables.ac_cable_make;
            cables.ac_cable_qty = (qty > 0 ? String(qty) : cables.ac_cable_qty) || "";
            if (productName) cables.ac_cable_description = productName;
        } else if (typeNorm === "dc_cable") {
            cables.dc_cable_make = makeName || cables.dc_cable_make;
            cables.dc_cable_qty = (qty > 0 ? String(qty) : cables.dc_cable_qty) || "";
            if (productName) cables.dc_cable_description = productName;
        } else if (typeNorm === "earthing") {
            cables.earthing_make = makeName || cables.earthing_make;
            cables.earthing_qty = (qty > 0 ? String(qty) : cables.earthing_qty) || "";
            cables.earthing_description = productName || cables.earthing_description;
            if (productName && !balance_of_system.earthing) balance_of_system.earthing = productName;
        } else if (typeNorm === "la" || typeNorm === "lightening_arrestor" || typeNorm === "lightning_arrestor") {
            cables.la_make = makeName || cables.la_make;
            cables.la_qty = (qty > 0 ? String(qty) : cables.la_qty) || "";
            cables.la_description = productName || cables.la_description;
            balance_of_system.lightening_arrestor = productName || makeName || balance_of_system.lightening_arrestor;
        } else if (typeNorm === "acdb") {
            balance_of_system.acdb = productName || makeName || balance_of_system.acdb;
        } else if (typeNorm === "dcdb") {
            balance_of_system.dcdb = productName || makeName || balance_of_system.dcdb;
        }
    }

    panel.make_logos = await getMakeLogos([...new Set(panelMakeIds)], productMakesMap, bucketClient);
    inverter.make_logos = await getMakeLogos([...new Set(inverterMakeIds)], productMakesMap, bucketClient);
    hybrid_inverter.make_logos = await getMakeLogos([...new Set(hybridInverterMakeIds)], productMakesMap, bucketClient);
    battery.make_logos = await getMakeLogos([...new Set(batteryMakeIds)], productMakesMap, bucketClient);

    return {
        panel,
        inverter,
        hybrid_inverter,
        battery,
        cables,
        structure,
        balance_of_system,
    };
};

/**
 * Prepare quotation data for PDF generation
 * @param {Object} quotation - Raw quotation from database
 * @param {Object} company - Company profile data
 * @param {Object} bankAccount - Bank account details
 * @param {Map} productMakesMap - Map of ProductMake ID to name
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @returns {Promise<Object>} Formatted data for PDF templates
 */
const prepareQuotationData = async (quotation, company, bankAccount, productMakesMap = new Map(), bucketClient) => {
    // Calculate derived values
    const projectCapacity = parseFloat(quotation.project_capacity) || 0;
    const pricePerKw = parseFloat(quotation.price_per_kw) || 0;
    const systemCost = projectCapacity * pricePerKw;
    const gstPercent = parseFloat(quotation.gst_rate) || 0;
    const gstAmount = systemCost * (gstPercent / 100);
    const gedaAmount = parseFloat(quotation.state_government_amount) || 0;
    const netMeteringCost = parseFloat(quotation.netmeter_amount) || 0;
    const grandTotal = systemCost + gstAmount + gedaAmount + netMeteringCost;
    const subsidyAmount = parseFloat(quotation.subsidy_amount) || 0;
    const stateSubsidyAmount = parseFloat(quotation.state_subsidy_amount) || 0;
    const totalSubsidy = subsidyAmount + stateSubsidyAmount;
    const finalCost = parseFloat(quotation.effective_cost) || (grandTotal - totalSubsidy);

    // Use graph fields from quotation for savings calculations
    const pricePerUnit = parseFloat(quotation.graph_price_per_unit) || 0; // Default Rs. 8/unit
    const perDayGeneration = parseFloat(quotation.graph_per_day_generation) || 0; // Default ~4 units/kW/day
    const yearlyIncrementPrice = parseFloat(quotation.graph_yearly_increment_price) || 0; // Default 5% yearly
    const yearlyDecrementGeneration = parseFloat(quotation.graph_yearly_decrement_generation) || 0; // Default 0.5% yearly

    // Trees saved and CO2 reduction based on project capacity
    const treesSaved = Math.round(projectCapacity * 50); // ~50 trees per kW
    const co2Reduction = Math.round(projectCapacity * 1.2); // ~1.2 tonnes per kW

    // Monthly generation calculation
    // Daily Generation = Project Capacity × Per-day generation per kWp
    const dailyGeneration = projectCapacity * perDayGeneration;

    // Seasonal factors for each month
    const seasonalFactors = [0.94, 0.95, 1.10, 1.12, 1.15, 0.98, 0.78, 0.78, 0.93, 1.05, 0.92, 0.86];
    // Days in each month (non-leap year)
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Monthly Generation = Daily Generation × No. of days × seasonal factor
    const rawMonthlyGeneration = monthNames.map((month, index) => {
        const value = Math.round(
            dailyGeneration * daysInMonth[index] * seasonalFactors[index]
        );
        return { month, value };
    });

    // Find max month for graph scaling
    const maxMonthly = Math.max(...rawMonthlyGeneration.map(m => m.value));

    // Add percentage for graph
    const monthlyGeneration = rawMonthlyGeneration.map(m => ({
        ...m,
        percentage: maxMonthly > 0 ? Math.round((m.value / maxMonthly) * 100) : 0
    }));



    // Calculate yearly generation from monthly values
    const yearlyGeneration = monthlyGeneration.reduce((sum, m) => sum + m.value, 0);

    // Calculate savings data based on yearly generation
    const annualSavings = Math.round(yearlyGeneration * pricePerUnit);
    const paybackPeriod = annualSavings > 0 ? +(finalCost / annualSavings).toFixed(1) : 0;

    // Build BOM section data from quotation flat fields
    let panel = {
        watt_peak: quotation.panel_size || 0,
        quantity: quotation.panel_quantity || 0,
        type: quotation.panel_type || "",
        make: getMakeNames(quotation.panel_make_ids, productMakesMap),
        warranty: quotation.panel_warranty || 0,
        performance_warranty: quotation.panel_performance_warranty || 0,
        make_logos: await getMakeLogos(quotation.panel_make_ids, productMakesMap, bucketClient),
    };
    let inverter = {
        size: quotation.inverter_size || 0,
        quantity: quotation.inverter_quantity || 0,
        make: getMakeNames(quotation.inverter_make_ids, productMakesMap),
        warranty: quotation.inverter_warranty || 0,
        make_logos: await getMakeLogos(quotation.inverter_make_ids, productMakesMap, bucketClient),
    };
    let hybrid_inverter = {
        size: quotation.hybrid_inverter_size || 0,
        quantity: quotation.hybrid_inverter_quantity || 0,
        make: getMakeNames(quotation.hybrid_inverter_make_ids, productMakesMap),
        warranty: quotation.hybrid_inverter_warranty || "",
        make_logos: await getMakeLogos(quotation.hybrid_inverter_make_ids, productMakesMap, bucketClient),
    };
    let battery = {
        size: quotation.battery_size || 0,
        quantity: quotation.battery_quantity || 0,
        type: quotation.battery_type || "",
        make: getMakeNames(quotation.battery_make_ids, productMakesMap),
        warranty: quotation.battery_warranty || "",
        make_logos: await getMakeLogos(quotation.battery_make_ids, productMakesMap, bucketClient),
    };
    let cables = {
        ac_cable_make: getMakeNames(quotation.cable_ac_make_ids, productMakesMap),
        ac_cable_qty: quotation.cable_ac_quantity || "",
        ac_cable_description: quotation.cable_ac_description || "",
        dc_cable_make: getMakeNames(quotation.cable_dc_make_ids, productMakesMap),
        dc_cable_qty: quotation.cable_dc_quantity || "",
        dc_cable_description: quotation.cable_dc_description || "",
        earthing_make: getMakeNames(quotation.earthing_make_ids, productMakesMap),
        earthing_qty: quotation.earthing_quantity || "",
        earthing_description: quotation.earthing_description || "",
        la_make: getMakeNames(quotation.la_make_ids, productMakesMap),
        la_qty: quotation.la_quantity || "",
        la_description: quotation.la_description || "",
    };
    let structure = {
        height: quotation.structure_height || "",
        material: quotation.structure_material || "",
        warranty: quotation.system_warranty_years || 0,
    };
    let balance_of_system = {
        acdb: quotation.acdb_description || "",
        dcdb: quotation.dcdb_description || "",
        earthing: quotation.earthing_description || "",
        lightening_arrestor: quotation.la_description || "",
        miscellaneous: quotation.mis_description || "",
    };

    // When quotation has bom_snapshot, derive section data from it so section-based BOM page is populated.
    // Snapshot data should drive the BOM composition (size, qty, make, etc.) but we KEEP warranty fields
    // from the quotation form (since BOM lines typically don't carry warranty info).
    if (Array.isArray(quotation.bom_snapshot) && quotation.bom_snapshot.length > 0) {
        const normalizedSnapshot = normalizeBomSnapshotForDisplay(quotation.bom_snapshot);
        const derived = await deriveBomSectionsFromSnapshot(normalizedSnapshot, productMakesMap, bucketClient);
        if (derived) {
            panel = {
                ...panel,
                ...derived.panel,
                // Preserve warranties from form
                warranty: panel.warranty,
                performance_warranty: panel.performance_warranty,
            };
            inverter = {
                ...inverter,
                ...derived.inverter,
                // Preserve warranty from form
                warranty: inverter.warranty,
            };
            hybrid_inverter = {
                ...hybrid_inverter,
                ...derived.hybrid_inverter,
                // Preserve warranty from form
                warranty: hybrid_inverter.warranty,
            };
            battery = {
                ...battery,
                ...derived.battery,
                // Preserve warranty from form
                warranty: battery.warranty,
            };
            cables = {
                ...cables,
                ...derived.cables,
            };
            structure = {
                ...structure,
                ...derived.structure,
            };
            balance_of_system = {
                ...balance_of_system,
                ...derived.balance_of_system,
            };
        }
    }

    return {
        // Quotation details
        quotation_number: quotation.quotation_number,
        quotation_date: handlebars.helpers.formatDate(quotation.quotation_date),
        valid_till: handlebars.helpers.formatDate(quotation.valid_till),
        project_capacity: projectCapacity.toFixed(2),

        // Customer details
        customer_name:
            quotation.customer_name || quotation.customer?.customer_name || "",
        mobile_number:
            quotation.mobile_number || quotation.customer?.mobile_number || "",

        // Prepared by (quotation user with robust fallbacks)
        prepared_by: {
            name: (quotation.user?.name != null && String(quotation.user.name).trim() !== "") ? String(quotation.user.name).trim() : "-",
            phone: (quotation.user?.mobile_number != null && String(quotation.user.mobile_number).trim() !== "") ? String(quotation.user.mobile_number).trim() : "-",
            email: (quotation.user?.email != null && String(quotation.user.email).trim() !== "") ? String(quotation.user.email).trim() : "-",
        },

        // Company details - normalized canonical object with full address
        company: (() => {
            const raw = company || {};
            const name = raw.company_name != null ? String(raw.company_name).trim() : "";
            const address = raw.address != null ? String(raw.address).trim() : "";
            const city = raw.city != null ? String(raw.city).trim() : "";
            const state = raw.state != null ? String(raw.state).trim() : "";
            const parts = [address, city, state].filter(Boolean);
            const addressLine = parts.length > 0 ? parts.join(", ") : "-";
            const locationLine = [city, state].filter(Boolean).join(", ") || "-";
            const website = raw.company_website != null ? String(raw.company_website).trim() : "";
            const websiteDisplay = website !== "" ? website : "-";
            const email = raw.company_email != null ? String(raw.company_email).trim() : "";
            const phone = raw.contact_number != null ? String(raw.contact_number).trim() : "";
            return {
                name,
                displayName: name || "-",
                email,
                emailDisplay: email !== "" ? email : "-",
                phone,
                phoneDisplay: phone !== "" ? phone : "-",
                website,
                websiteDisplay,
                addressLine,
                locationLine,
                city: city || "-",
                state: state || "-",
            };
        })(),

        // Company branding paths (bucket keys or legacy paths) for PDF generation
        companyLogoPath: (company?.logo != null && String(company.logo).trim() !== "") ? String(company.logo).trim() : null,
        companyHeaderPath: (company?.header != null && String(company.header).trim() !== "") ? String(company.header).trim() : null,
        companyFooterPath: (company?.footer != null && String(company.footer).trim() !== "") ? String(company.footer).trim() : null,
        companyStampPath: (company?.stamp != null && String(company.stamp).trim() !== "") ? String(company.stamp).trim() : null,

        // Pricing
        price_per_kw: pricePerKw,
        system_cost: systemCost,
        gst_percent: gstPercent,
        gst_amount: gstAmount,
        net_metering_cost: netMeteringCost,
        geda_amount: gedaAmount,
        grand_total: grandTotal,
        state_subsidy_amount: stateSubsidyAmount,
        final_cost: finalCost,

        // Payment terms
        payment_terms: quotation.payment_terms || [
            "Full payment before system delivery",
        ],

        // Bank details
        bank: bankAccount
            ? {
                name: bankAccount.bank_name || "",
                account_name: bankAccount.bank_account_name,
                account_number: bankAccount.bank_account_number || "",
                ifsc: bankAccount.bank_account_ifsc || "",
                branch: bankAccount.bank_account_branch || "",
                upi_id: bankAccount.upi_id || "harsh7984@axl",
            }
            : null,

        // Bill of Material data - section-based layout only (panel, inverter, etc. from flat fields or derived from bom_snapshot)
        panel,
        inverter,
        hybrid_inverter,
        battery,
        cables,
        structure,
        balance_of_system,

        // Only show BOM sections when qty > 0 (optional products hidden)
        bom_show_panel: (parseFloat(panel.quantity) || 0) > 0,
        bom_show_inverter: (parseFloat(inverter.quantity) || 0) > 0,
        bom_show_hybrid_inverter: (parseFloat(hybrid_inverter.quantity) || 0) > 0,
        bom_show_battery: (parseFloat(battery.quantity) || 0) > 0,
        bom_show_cables:
            (parseFloat(cables.ac_cable_qty) || 0) > 0 ||
            (parseFloat(cables.dc_cable_qty) || 0) > 0 ||
            (parseFloat(cables.earthing_qty) || 0) > 0 ||
            (parseFloat(cables.la_qty) || 0) > 0,
        bom_show_structure:
            (parseFloat(structure.height) || 0) > 0 ||
            (structure.material != null && String(structure.material).trim() !== ""),
        bom_show_balance_of_system:
            Boolean(
                (balance_of_system.acdb != null && String(balance_of_system.acdb).trim() !== "") ||
                (balance_of_system.dcdb != null && String(balance_of_system.dcdb).trim() !== "") ||
                (balance_of_system.earthing != null && String(balance_of_system.earthing).trim() !== "") ||
                (balance_of_system.lightening_arrestor != null && String(balance_of_system.lightening_arrestor).trim() !== "") ||
                (balance_of_system.miscellaneous != null && String(balance_of_system.miscellaneous).trim() !== "")
            ),

        // BOM page always uses section-based layout; never pass bom_snapshot so table is never rendered
        bom_snapshot: null,

        // Savings and Payback data
        savings: {
            payback_period: paybackPeriod,
            yearly_generation: yearlyGeneration,
            annual_savings: annualSavings,
            project_cost: finalCost,
            trees_saved: treesSaved,
            co2_reduction: co2Reduction,
        },
        monthly_generation: monthlyGeneration,
    };
};

module.exports = {
    generateQuotationPDF,
    prepareQuotationData,
    buildHtmlDocument,
};
