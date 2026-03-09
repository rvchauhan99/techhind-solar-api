"use strict";

const handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const bucketService = require("../../common/services/bucket.service.js");
const puppeteerService = require("../../common/services/puppeteer.service.js");
const { normalizeBomSnapshotForDisplay } = require("../../common/utils/bomUtils.js");
const {
    getImageDataUrl,
    setImageDataUrl,
} = require("./pdfImageCache.service.js");

// Template base path; per-template dir is TEMPLATE_BASE / templateKey (e.g. "default")
const TEMPLATE_BASE = path.join(__dirname, "../../../templates/quotation");
const PUBLIC_DIR = path.join(__dirname, "../../../public");

function parseMoney(value) {
    if (value == null) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value).trim();
    if (!raw) return 0;

    // Handle common formats like "78,000", "₹ 78,000.00", "INR 78000".
    const cleaned = raw.replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
    if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return 0;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
}

// Concurrency limit for PDF page renders (prevents Chromium OOM under burst traffic)
const PDF_RENDER_MAX_CONCURRENCY = Math.max(1, parseInt(process.env.PDF_RENDER_MAX_CONCURRENCY || "2", 10));
const pdfRenderSemaphore = { active: 0, queue: [] };

function acquirePdfRenderSlot() {
    if (pdfRenderSemaphore.active < PDF_RENDER_MAX_CONCURRENCY) {
        pdfRenderSemaphore.active += 1;
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        pdfRenderSemaphore.queue.push(resolve);
    });
}

function releasePdfRenderSlot() {
    pdfRenderSemaphore.active -= 1;
    if (pdfRenderSemaphore.queue.length > 0) {
        const next = pdfRenderSemaphore.queue.shift();
        pdfRenderSemaphore.active += 1;
        if (typeof next === "function") next();
    }
}

// URL image fetch guards (prevent hang/OOM from slow or huge responses)
const PDF_IMAGE_FETCH_TIMEOUT_MS = Math.max(1000, parseInt(process.env.PDF_IMAGE_FETCH_TIMEOUT_MS || "15000", 10));
const PDF_IMAGE_FETCH_MAX_BYTES = Math.max(1024 * 100, parseInt(process.env.PDF_IMAGE_FETCH_MAX_BYTES || "5242880", 10)); // default 5MB
const PDF_IMAGE_MAX_BYTES_BEFORE_RESIZE = parseInt(process.env.PDF_IMAGE_MAX_BYTES_BEFORE_RESIZE || "200000", 10); // 200KB; above this, resize/compress
const PDF_IMAGE_RESIZE_MAX_WIDTH = Math.max(400, parseInt(process.env.PDF_IMAGE_RESIZE_MAX_WIDTH || "1200", 10));
const PDF_IMAGE_JPEG_QUALITY = Math.max(50, Math.min(100, parseInt(process.env.PDF_IMAGE_JPEG_QUALITY || "80", 10)));

// In-memory cache for public URL image fetches (tenant-agnostic; key = URL). Reduces repeated fetches across PDFs.
const URL_IMAGE_CACHE_MAX = 100;
const URL_IMAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const urlImageCache = new Map(); // key -> { dataUrl, ts }

function getCachedUrlImage(url) {
    const entry = urlImageCache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.ts > URL_IMAGE_CACHE_TTL_MS) {
        urlImageCache.delete(url);
        return null;
    }
    return entry.dataUrl;
}

function setCachedUrlImage(url, dataUrl) {
    if (urlImageCache.size >= URL_IMAGE_CACHE_MAX) {
        let oldest = Infinity;
        let oldestKey = null;
        for (const [k, v] of urlImageCache) {
            if (v.ts < oldest) {
                oldest = v.ts;
                oldestKey = k;
            }
        }
        if (oldestKey != null) urlImageCache.delete(oldestKey);
    }
    urlImageCache.set(url, { dataUrl, ts: Date.now() });
}

// In-memory cache for local file -> data URL conversions (template assets, logos, etc.).
// Keyed by filePath + mimeType, stores empty string for missing files so we do not re-stat them.
const FILE_DATA_URL_CACHE_MAX = 200;
const fileDataUrlCache = new Map(); // key -> { dataUrl, ts }

function getCachedFileDataUrl(key) {
    const entry = fileDataUrlCache.get(key);
    return entry ? entry.dataUrl : null;
}

function setCachedFileDataUrl(key, dataUrl) {
    if (fileDataUrlCache.size >= FILE_DATA_URL_CACHE_MAX) {
        // simple FIFO eviction
        const firstKey = fileDataUrlCache.keys().next().value;
        if (firstKey !== undefined) fileDataUrlCache.delete(firstKey);
    }
    fileDataUrlCache.set(key, { dataUrl, ts: Date.now() });
}

// Soft dedupe for missing bucket keys: avoid logging the same missing key repeatedly in a short window.
const MISSING_BUCKET_KEY_LOG_TTL_MS = 60 * 1000; // 1 minute
const missingBucketKeyLogCache = new Map(); // key -> ts

function shouldLogMissingBucketKey(key) {
    const now = Date.now();
    const last = missingBucketKeyLogCache.get(key);
    if (last && now - last < MISSING_BUCKET_KEY_LOG_TTL_MS) {
        return false;
    }
    missingBucketKeyLogCache.set(key, now);
    return true;
}

// ---------------------------------------------------------------------------
// Module-level compiled template cache: compile Handlebars templates + CSS
// exactly once per templateKey. Bounded by count + TTL to avoid unbounded growth.
// ---------------------------------------------------------------------------
const COMPILED_TEMPLATE_CACHE_MAX = Math.max(5, parseInt(process.env.COMPILED_TEMPLATE_CACHE_MAX || "20", 10));
const COMPILED_TEMPLATE_CACHE_TTL_MS = parseInt(process.env.COMPILED_TEMPLATE_CACHE_TTL_MS || "0", 10) || 60 * 60 * 1000; // 1 hour, 0 = no TTL
const compiledTemplateCache = new Map(); // templateKey -> { bundle, ts }

function getCompiledTemplates(templateKey) {
    const entry = compiledTemplateCache.get(templateKey);
    if (entry) {
        if (COMPILED_TEMPLATE_CACHE_TTL_MS > 0 && Date.now() - entry.ts > COMPILED_TEMPLATE_CACHE_TTL_MS) {
            compiledTemplateCache.delete(templateKey);
        } else {
            return entry.bundle;
        }
    }
    const templateDir = getTemplateDir(templateKey);

    // Register footer partial once per template key
    const footerPartialPath = path.join(templateDir, "partials/template-footer.hbs");
    if (fs.existsSync(footerPartialPath)) {
        const footerPartialContent = fs.readFileSync(footerPartialPath, "utf-8");
        handlebars.registerPartial("templateFooter", footerPartialContent);
    }

    const styles = fs.readFileSync(path.join(templateDir, "styles/quotation.css"), "utf-8");
    const bundle = {
        styles,
        page1Template: loadTemplate(templateDir, "partials/page1-cover.hbs"),
        page2Template: loadTemplate(templateDir, "partials/page2-welcome.hbs"),
        page3Template: loadTemplate(templateDir, "partials/page3-about.hbs"),
        page4Template: loadTemplate(templateDir, "partials/page4-offer.hbs"),
        page5Template: loadTemplate(templateDir, "partials/page5-bom.hbs"),
        page6Template: loadTemplate(templateDir, "partials/page6-savings.hbs"),
        page7Template: loadTemplate(templateDir, "partials/page7-timeline.hbs"),
        page8Template: loadTemplate(templateDir, "partials/page8-terms.hbs"),
        page9Template: loadTemplate(templateDir, "partials/page9-thankyou.hbs"),
        mainTemplate: loadTemplate(templateDir, "quotation.hbs"),
    };
    if (compiledTemplateCache.size >= COMPILED_TEMPLATE_CACHE_MAX) {
        let oldestKey = null;
        let oldestTs = Infinity;
        for (const [k, v] of compiledTemplateCache) {
            if (v.ts < oldestTs) {
                oldestTs = v.ts;
                oldestKey = k;
            }
        }
        if (oldestKey != null) compiledTemplateCache.delete(oldestKey);
    }
    compiledTemplateCache.set(templateKey, { bundle, ts: Date.now() });
    console.info(`[PDF] Compiled templates cached for key: "${templateKey}"`);
    return bundle;
}

// ---------------------------------------------------------------------------
// QR code cache: same UPI string → same QR code. Bounded by count + TTL.
// ---------------------------------------------------------------------------
const QR_CODE_CACHE_MAX = Math.max(10, parseInt(process.env.QR_CODE_CACHE_MAX || "100", 10));
const QR_CODE_CACHE_TTL_MS = parseInt(process.env.QR_CODE_CACHE_TTL_MS || "0", 10) || 5 * 60 * 1000; // 5 min
const qrCodeCache = new Map(); // upiString -> { dataUrl, ts }

/**
 * Get template directory for a template key
 * @param {string} templateKey - e.g. "default"
 * @returns {string} Absolute path to template folder
 */
const getTemplateDir = (templateKey) => path.join(TEMPLATE_BASE, templateKey || "default");

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

handlebars.registerHelper("formatYears", function (value) {
    if (value === null || value === undefined || value === "") {
        return "";
    }
    const str = String(value).trim();
    const num = parseFloat(str);
    if (Number.isNaN(num)) {
        // Fallback: return original string if we can't parse a number
        return str;
    }
    return `${num} Year`;
});

/**
 * Load and compile a template file
 * @param {string} templateDir - Absolute path to template directory
 * @param {string} templatePath - Relative path from template directory (e.g. "partials/page1-cover.hbs")
 * @returns {Function} Compiled Handlebars template
 */
const loadTemplate = (templateDir, templatePath) => {
    const fullPath = path.join(templateDir, templatePath);
    const templateContent = fs.readFileSync(fullPath, "utf-8");
    return handlebars.compile(templateContent);
};

/**
 * Read file as base64 data URL (local filesystem). Use only for assets that exist in repo (e.g. template assets).
 * @param {string} filePath - Absolute path to file
 * @param {string} mimeType - MIME type of the file
 * @param {boolean} [warnIfMissing] - If true, log when file not found (default true)
 * @returns {string} Base64 data URL or ""
 */
const fileToDataUrl = (filePath, mimeType = "image/jpeg", warnIfMissing = true) => {
    try {
        const cacheKey = `${filePath}|${mimeType}`;
        const cached = getCachedFileDataUrl(cacheKey);
        if (cached !== null) {
            return cached;
        }
        if (!fs.existsSync(filePath)) {
            if (warnIfMissing) console.warn(`File not found: ${filePath}`);
            setCachedFileDataUrl(cacheKey, "");
            return "";
        }
        const fileBuffer = fs.readFileSync(filePath);
        const base64 = fileBuffer.toString("base64");
        const dataUrl = `data:${mimeType};base64,${base64}`;
        setCachedFileDataUrl(cacheKey, dataUrl);
        return dataUrl;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return "";
    }
};

/**
 * If buffer is over threshold, resize (max width) and compress to JPEG to reduce HTML size and memory.
 * Skips SVG and small images. On failure (e.g. sharp not installed or corrupt image), returns original.
 * @param {Buffer} buf - Image buffer
 * @param {string} contentType - MIME type
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
async function compressImageIfLarge(buf, contentType) {
    if (!Buffer.isBuffer(buf) || buf.length <= PDF_IMAGE_MAX_BYTES_BEFORE_RESIZE) {
        return { buffer: buf, contentType };
    }
    const ct = (contentType || "").toLowerCase();
    if (ct.includes("svg") || ct.includes("gif")) {
        return { buffer: buf, contentType };
    }
    try {
        const sharp = require("sharp");
        const pipeline = sharp(buf);
        const meta = await pipeline.metadata();
        const width = meta.width || 0;
        const needResize = width > PDF_IMAGE_RESIZE_MAX_WIDTH;
        const out = needResize
            ? pipeline.resize(PDF_IMAGE_RESIZE_MAX_WIDTH, null, { withoutEnlargement: true })
            : pipeline;
        const jpegBuf = await out.jpeg({ quality: PDF_IMAGE_JPEG_QUALITY }).toBuffer();
        return { buffer: jpegBuf, contentType: "image/jpeg" };
    } catch (err) {
        if (process.env.NODE_ENV !== "test") {
            console.warn("[PDF] Image resize skipped:", err.message || err);
        }
        return { buffer: buf, contentType };
    }
}

/**
 * Resolve path to base64 data URL: bucket key, legacy /uploads/ path (→ bucket first), or full URL (cached).
 * Avoids local filesystem for /uploads/ and missing files; uses bucket or public URL.
 * @param {string} pathOrKey - Bucket key (no leading /), legacy path (e.g. /uploads/logo.png), or http(s) URL
 * @param {string} mimeType - MIME type fallback
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @param {{ tenantId?: string|number }} [options] - Optional tenantId for template-asset warm cache lookup
 * @returns {Promise<string>} Base64 data URL
 */
const pathToDataUrl = async (pathOrKey, mimeType = "image/jpeg", bucketClient, options = {}) => {
    if (!pathOrKey) return "";
    // Full URL: use in-memory cache to avoid refetching same config image across PDFs (with timeout + max size)
    if (pathOrKey.startsWith("http://") || pathOrKey.startsWith("https://")) {
        const cached = getCachedUrlImage(pathOrKey);
        if (cached) return cached;
        try {
            const https = require("https");
            const http = require("http");
            const protocol = pathOrKey.startsWith("https") ? https : http;
            const { buf, contentType: resolvedType } = await new Promise((resolve, reject) => {
                const req = protocol.get(pathOrKey, (res) => {
                    if (res.statusCode !== 200) {
                        clearTimeout(timeoutId);
                        reject(new Error(`Image fetch status ${res.statusCode}`));
                        return;
                    }
                    const chunks = [];
                    let totalLength = 0;
                    res.on("data", (chunk) => {
                        totalLength += chunk.length;
                        if (totalLength > PDF_IMAGE_FETCH_MAX_BYTES) {
                            clearTimeout(timeoutId);
                            reject(new Error(`Image exceeds max size ${PDF_IMAGE_FETCH_MAX_BYTES} bytes`));
                            req.destroy();
                            return;
                        }
                        chunks.push(chunk);
                    });
                    res.on("end", () => {
                        clearTimeout(timeoutId);
                        const buf = Buffer.concat(chunks);
                        const ct = res.headers["content-type"] || "";
                        const contentType = /image\/png/i.test(ct) ? "image/png"
                            : /image\/svg/i.test(ct) ? "image/svg+xml"
                                : (buf.length >= 2 && buf[0] === 0x89 && buf[1] === 0x50) ? "image/png"
                                    : mimeType;
                        resolve({ buf, contentType });
                    });
                    res.on("error", (err) => {
                        clearTimeout(timeoutId);
                        reject(err);
                    });
                });
                const timeoutId = setTimeout(() => {
                    req.destroy();
                    reject(new Error(`Image fetch timeout after ${PDF_IMAGE_FETCH_TIMEOUT_MS}ms`));
                }, PDF_IMAGE_FETCH_TIMEOUT_MS);
                req.on("error", (err) => {
                    clearTimeout(timeoutId);
                    reject(err);
                });
            });
            const { buffer: outBuf, contentType: outType } = await compressImageIfLarge(buf, resolvedType);
            const base64 = outBuf.toString("base64");
            const dataUrl = `data:${outType};base64,${base64}`;
            setCachedUrlImage(pathOrKey, dataUrl);
            return dataUrl;
        } catch (err) {
            console.error(`Error fetching logo URL ${pathOrKey}:`, err.message || err);
            return "";
        }
    }
    if (options.tenantId != null) {
        const cached = getImageDataUrl(options.tenantId, pathOrKey);
        if (cached) return cached;
    }
    // Legacy /uploads/ path: resolve from bucket (tenant or default), not local filesystem
    if (pathOrKey.startsWith("/uploads/")) {
        const bucketKey = pathOrKey.slice(1); // "uploads/..."
        const tryFetch = async (client) => {
            try {
                const result = client
                    ? await bucketService.getObjectWithClient(client, bucketKey)
                    : await bucketService.getObject(bucketKey);
                const body = result.body;
                const contentType = result.contentType || mimeType;
                const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
                const { buffer: outBuf, contentType: outType } = await compressImageIfLarge(buf, contentType);
                const base64 = outBuf.toString("base64");
                return `data:${outType};base64,${base64}`;
            } catch (e) {
                return null;
            }
        };
        let dataUrl = await tryFetch(bucketClient);
        // No fallback to default bucket when tenant bucketClient is set (tenant isolation)
        if (dataUrl && options.tenantId != null) {
            setImageDataUrl(options.tenantId, pathOrKey, dataUrl);
        }
        return dataUrl || "";
    }
    // Other paths starting with /: try local only (e.g. /public/solar-background.jpg in config)
    if (pathOrKey.startsWith("/")) {
        const absolutePath = path.join(PUBLIC_DIR, pathOrKey);
        return fileToDataUrl(absolutePath, mimeType, false);
    }
    // Bucket key
    const tryFetch = async (client) => {
        try {
            const result = client
                ? await bucketService.getObjectWithClient(client, pathOrKey)
                : await bucketService.getObject(pathOrKey);
            const body = result.body;
            const contentType = result.contentType || mimeType;
            const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
            const { buffer: outBuf, contentType: outType } = await compressImageIfLarge(buf, contentType);
            const base64 = outBuf.toString("base64");
            return `data:${outType};base64,${base64}`;
        } catch (e) {
            return null;
        }
    };
    let dataUrl = await tryFetch(bucketClient);
    // No fallback to default bucket when tenant bucketClient is set (tenant isolation)
    if (!dataUrl) {
        if (shouldLogMissingBucketKey(pathOrKey)) {
            console.warn(`Error reading from bucket: ${pathOrKey}`);
        }
        return "";
    }
    if (options.tenantId != null) {
        setImageDataUrl(options.tenantId, pathOrKey, dataUrl);
    }
    return dataUrl;
};

/**
 * Generate QR code as data URL (cached by UPI string to avoid repeated computation).
 * @param {string} data - Data to encode in QR code
 * @returns {Promise<string>} Base64 data URL of QR code
 */
const generateQRCode = async (data) => {
    try {
        if (!data) return "";
        const entry = qrCodeCache.get(data);
        if (entry) {
            if (QR_CODE_CACHE_TTL_MS > 0 && Date.now() - entry.ts > QR_CODE_CACHE_TTL_MS) {
                qrCodeCache.delete(data);
            } else {
                return entry.dataUrl;
            }
        }
        const dataUrl = await QRCode.toDataURL(data, {
            width: 150,
            margin: 1,
            color: {
                dark: "#000000",
                light: "#ffffff",
            },
        });
        if (qrCodeCache.size >= QR_CODE_CACHE_MAX) {
            let oldestKey = null;
            let oldestTs = Infinity;
            for (const [k, v] of qrCodeCache) {
                if (v.ts < oldestTs) {
                    oldestTs = v.ts;
                    oldestKey = k;
                }
            }
            if (oldestKey != null) qrCodeCache.delete(oldestKey);
        }
        qrCodeCache.set(data, { dataUrl, ts: Date.now() });
        return dataUrl;
    } catch (error) {
        console.error("Error generating QR code:", error);
        return "";
    }
};

/**
 * Build the complete HTML document from templates
 * @param {Object} data - Quotation data
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @param {{ templateKey?: string, templateConfig?: { default_background_image_path?: string, default_footer_image_path?: string, page_backgrounds?: Record<string, string> } }} [options] - Template key and config for backgrounds/footer
 * @returns {Promise<string>} Complete HTML string
 */
const buildHtmlDocument = async (data, bucketClient, options = {}) => {
    const templateKey = options.templateKey || "default";
    const templateConfig = options.templateConfig || {};

    // Use module-level compiled template cache — avoids disk reads + Handlebars
    // compilation on every request (compiled once per templateKey per process lifetime).
    const {
        styles,
        page1Template,
        page2Template,
        page3Template,
        page4Template,
        page5Template,
        page6Template,
        page7Template,
        page8Template,
        page9Template,
        mainTemplate,
    } = getCompiledTemplates(templateKey);

    const fallbackBackgroundPath = path.join(PUBLIC_DIR, "solar-background.jpg");
    const fallbackBackgroundImage = fs.existsSync(fallbackBackgroundPath)
        ? fileToDataUrl(fallbackBackgroundPath, "image/jpeg", false)
        : "";

    // Resolve template image key to data URL (tenant bucket); cache by key to avoid duplicate fetches
    const mimeFromKey = (key) => {
        if (!key) return "image/jpeg";
        const ext = path.extname(key).toLowerCase();
        return ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
    };
    const resolvedTemplateImages = {};
    const pathToDataUrlOpts = options.tenantId != null ? { tenantId: options.tenantId } : {};
    const resolveTemplateImage = async (key) => {
        if (!key) return "";
        if (key.startsWith("http://") || key.startsWith("https://")) {
            try {
                return await pathToDataUrl(key, mimeFromKey(key), bucketClient, pathToDataUrlOpts);
            } catch (_) {
                return "";
            }
        }
        if (resolvedTemplateImages[key] !== undefined) return resolvedTemplateImages[key];
        const mime = mimeFromKey(key);
        const dataUrl = await pathToDataUrl(key, mime, bucketClient, pathToDataUrlOpts);
        resolvedTemplateImages[key] = dataUrl || "";
        return resolvedTemplateImages[key];
    };

    // Prefer inline data (stored in config); only resolve from bucket when missing
    const hasInlineBg = templateConfig.default_background_image_data && String(templateConfig.default_background_image_data).trim().length > 0;
    const hasInlineFooter = templateConfig.default_footer_image_data && String(templateConfig.default_footer_image_data).trim().length > 0;
    const pageBackgroundsData = templateConfig.page_backgrounds_data && typeof templateConfig.page_backgrounds_data === "object" ? templateConfig.page_backgrounds_data : {};

    const allTemplateKeys = new Set();
    if (!hasInlineBg && templateConfig.default_background_image_path) allTemplateKeys.add(templateConfig.default_background_image_path);
    if (!hasInlineFooter && templateConfig.default_footer_image_path) allTemplateKeys.add(templateConfig.default_footer_image_path);
    for (let n = 1; n <= 9; n++) {
        const pageKey = String(n);
        if (pageBackgroundsData[pageKey]) continue; // has inline data for this page
        const key = (templateConfig.page_backgrounds && templateConfig.page_backgrounds[pageKey]) || templateConfig.default_background_image_path;
        if (key) allTemplateKeys.add(key);
    }

    await Promise.all([...allTemplateKeys].map(k => resolveTemplateImage(k)));

    const defaultConfigBg = hasInlineBg
        ? templateConfig.default_background_image_data
        : (templateConfig.default_background_image_path ? resolvedTemplateImages[templateConfig.default_background_image_path] || "" : "");
    const defaultFooterImageUrl = hasInlineFooter
        ? templateConfig.default_footer_image_data
        : (templateConfig.default_footer_image_path ? resolvedTemplateImages[templateConfig.default_footer_image_path] || "" : "");

    if (templateConfig.default_footer_image_path && !hasInlineFooter && !defaultFooterImageUrl) {
        console.warn("[PDF] default_footer_image_path is set but footer image resolution failed:", templateConfig.default_footer_image_path);
    }

    const pageBackgrounds = {};
    for (let n = 1; n <= 9; n++) {
        const pageKey = String(n);
        if (pageBackgroundsData[pageKey]) {
            pageBackgrounds[n] = pageBackgroundsData[pageKey];
        } else {
            const key = (templateConfig.page_backgrounds && templateConfig.page_backgrounds[pageKey]) || templateConfig.default_background_image_path;
            pageBackgrounds[n] = key ? (resolvedTemplateImages[key] || defaultConfigBg || fallbackBackgroundImage) : (defaultConfigBg || fallbackBackgroundImage);
        }
    }

    const backgroundImage = pageBackgrounds[1] || fallbackBackgroundImage;

    // Helper to resolve branding image from path (bucket key or legacy path)
    const resolveBrandingImage = async (pathOrKey, fallbackPaths = []) => {
        if (pathOrKey) {
            const ext = path.extname(pathOrKey).toLowerCase();
            const mimeType = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
            const dataUrl = await pathToDataUrl(pathOrKey, mimeType, bucketClient, pathToDataUrlOpts);
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

    // Resolve branding images in parallel
    const defaultLogoPaths = [
        path.join(PUBLIC_DIR, "logo.png"),
        path.join(PUBLIC_DIR, "solar-earth-logo.png"),
    ];
    const [logoImage, headerImage, footerImage, stampImage] = await Promise.all([
        resolveBrandingImage(data.companyLogoPath, defaultLogoPaths),
        resolveBrandingImage(data.companyHeaderPath, []),
        resolveBrandingImage(data.companyFooterPath, []),
        resolveBrandingImage(data.companyStampPath, []),
    ]);

    // Generate QR code for UPI payment
    const upiString = data.bank
        ? `upi://pay?pa=${data.bank.upi_id || ""}&cu=INR`
        : "";
    const qrCodeImage = await generateQRCode(upiString);

    // Payment logos - load from templates/quotation/assets folder (tracked by git)
    const templateDir = getTemplateDir(templateKey);
    const paymentLogosDir = path.join(templateDir, "assets", "payment-logos");
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
        pageBackgrounds,
        defaultFooterImageUrl,
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

    const page1 = page1Template({ ...templateData, backgroundImage: pageBackgrounds[1] || backgroundImage });
    const page2 = page2Template({ ...templateData, backgroundImage: pageBackgrounds[2] || backgroundImage });
    const page3 = page3Template({ ...templateData, backgroundImage: pageBackgrounds[3] || backgroundImage });
    const page4 = page4Template({ ...templateData, backgroundImage: pageBackgrounds[4] || backgroundImage });
    const page5 = page5Template({ ...templateData, backgroundImage: pageBackgrounds[5] || backgroundImage });
    const page6 = page6Template({ ...templateData, backgroundImage: pageBackgrounds[6] || backgroundImage });
    const page7 = page7Template({ ...templateData, backgroundImage: pageBackgrounds[7] || backgroundImage });
    const page8 = page8Template({ ...templateData, backgroundImage: pageBackgrounds[8] || backgroundImage });
    const page9 = page9Template({ ...templateData, backgroundImage: pageBackgrounds[9] || backgroundImage });

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

// PDF cache + singleflight controls (env-driven).
// PDF_CACHE_ENABLED defaults to TRUE — set PDF_CACHE_ENABLED=false to disable.
// Cache is invalidated automatically via the version key (quotation/template/company updated_at),
// so enabling it is safe and dramatically speeds up repeated views of the same quotation.
const PDF_CACHE_ENABLED = process.env.PDF_CACHE_ENABLED !== "false";
const PDF_SINGLEFLIGHT_ENABLED = process.env.PDF_SINGLEFLIGHT_ENABLED !== "false";
const PDF_CACHE_MAX = parseInt(process.env.PDF_CACHE_MAX || "50", 10);
const PDF_CACHE_TTL_MS = parseInt(process.env.PDF_CACHE_TTL_MS || "0", 10) || 15 * 60 * 1000; // 15 min, 0 = no TTL
const PDF_CACHE_MAX_BYTES = parseInt(process.env.PDF_CACHE_MAX_BYTES || "0", 10); // 0 = no byte limit
const PDF_METRICS_ENABLED = process.env.PDF_METRICS_ENABLED === "true";
const PDF_LIGHTWEIGHT_RENDERER_ENABLED = process.env.PDF_LIGHTWEIGHT_RENDERER_ENABLED === "true";
const PDF_LIGHTWEIGHT_RENDERER_TEMPLATE_KEYS = (process.env.PDF_LIGHTWEIGHT_RENDERER_TEMPLATE_KEYS || "default")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// In-memory versioned PDF cache and singleflight map
const pdfCache = new Map(); // cacheKey -> { buffer, ts, bytes }
const pdfSingleflight = new Map(); // cacheKey -> Promise<Buffer>
let pdfCacheTotalBytes = 0;

function getCachedPdf(cacheKey) {
    const entry = pdfCache.get(cacheKey);
    if (!entry) return null;
    if (PDF_CACHE_TTL_MS > 0 && Date.now() - entry.ts > PDF_CACHE_TTL_MS) {
        pdfCache.delete(cacheKey);
        pdfCacheTotalBytes -= entry.bytes || 0;
        return null;
    }
    return entry.buffer;
}

function evictOldestPdfCacheEntry() {
    let oldestKey = null;
    let oldestTs = Infinity;
    for (const [k, v] of pdfCache) {
        if (v.ts < oldestTs) {
            oldestTs = v.ts;
            oldestKey = k;
        }
    }
    if (oldestKey != null) {
        const entry = pdfCache.get(oldestKey);
        if (entry && entry.bytes) pdfCacheTotalBytes -= entry.bytes;
        pdfCache.delete(oldestKey);
    }
}

function setCachedPdf(cacheKey, buffer) {
    const bytes = buffer && buffer.length ? buffer.length : 0;
    while (pdfCache.size >= PDF_CACHE_MAX || (PDF_CACHE_MAX_BYTES > 0 && pdfCacheTotalBytes + bytes > PDF_CACHE_MAX_BYTES)) {
        if (pdfCache.size === 0) break;
        evictOldestPdfCacheEntry();
    }
    pdfCache.set(cacheKey, { buffer, ts: Date.now(), bytes });
    pdfCacheTotalBytes += bytes;
}

/**
 * Invalidate all PDF cache entries for a tenant (e.g. after template config image update).
 * Call from quotationTemplate.service when config is updated.
 * @param {string|number} tenantId - Tenant ID (must match cache key prefix)
 */
function invalidatePdfCacheForTenant(tenantId) {
    if (tenantId == null) return;
    const prefix = `${tenantId}:`;
    for (const key of pdfCache.keys()) {
        if (String(key).startsWith(prefix)) {
            const entry = pdfCache.get(key);
            if (entry && entry.bytes) pdfCacheTotalBytes -= entry.bytes;
            pdfCache.delete(key);
        }
    }
}

function recordPdfMetrics(stageTimings, cacheInfo, metricsContext = {}) {
    if (!PDF_METRICS_ENABLED) return;
    const safe = (v) => (Number.isFinite(v) ? v : null);
    const mem = process.memoryUsage && process.memoryUsage();
    const payload = {
        source: "quotation_pdf",
        t_fetchDataMs: safe(stageTimings.fetchDataMs),
        t_resolveAssetsMs: safe(stageTimings.resolveAssetsMs),
        t_htmlBuildMs: safe(stageTimings.htmlBuildMs),
        t_pdfRenderMs: safe(stageTimings.pdfRenderMs),
        t_totalMs: safe(stageTimings.totalMs),
        cacheHit: cacheInfo.cacheHit,
        singleflightJoined: cacheInfo.singleflightJoined,
        ...(metricsContext.queuePending != null && { queuePending: metricsContext.queuePending }),
        ...(metricsContext.queueActive != null && { queueActive: metricsContext.queueActive }),
        ...(mem && Number.isFinite(mem.heapUsed) && { heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024) }),
    };
    console.info("[PDF_METRICS]", JSON.stringify(payload));
}

/**
 * Low-level renderer: generate PDF from prepared HTML.
 * Includes one automatic retry if the browser crashes/disconnects (e.g. OOM on production).
 * @param {Object} quotationData - Complete quotation data object
 * @param {{ bucketClient?: { s3: object, bucketName: string }, templateKey?: string, templateConfig?: object }} [options]
 * @returns {Promise<Buffer>}
 */
const renderQuotationPDF = async (quotationData, options = {}) => {
    const { bucketClient, templateKey, templateConfig } = options;

    // Optional low-memory renderer path for standard templates.
    // This intentionally trades visual parity for lower server memory usage.
    if (PDF_LIGHTWEIGHT_RENDERER_ENABLED) {
        const allowAll = PDF_LIGHTWEIGHT_RENDERER_TEMPLATE_KEYS.length === 0;
        const enabledForTemplate = allowAll || PDF_LIGHTWEIGHT_RENDERER_TEMPLATE_KEYS.includes(templateKey || "default");
        if (enabledForTemplate) {
            return renderQuotationPDFLightweight(quotationData);
        }
    }

    await acquirePdfRenderSlot();
    const doRenderAttempt = async () => {
        let page = null;
        try {
            const html = await buildHtmlDocument(quotationData, bucketClient, { templateKey, templateConfig, tenantId: options.tenantId });

            const browser = await puppeteerService.getBrowser();
            page = await browser.newPage();

            // Limit page memory: intercept and block third-party requests (none expected in self-contained HTML)
            await page.setRequestInterception(true);
            page.on("request", (req) => {
                const type = req.resourceType();
                // Allow: document, stylesheet, image, font (needed for inline PDF content)
                // Block: xhr, fetch, websocket, media (not needed; reduces memory)
                if (["xhr", "fetch", "websocket", "media", "other"].includes(type)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await page.setContent(html, {
                waitUntil: "domcontentloaded",
                timeout: 60000,
            });

            const pdfBuffer = await page.pdf({
                format: "A4",
                printBackground: true,
                preferCSSPageSize: true,
                margin: { top: "0", right: "0", bottom: "0", left: "0" },
                timeout: 60000,
            });

            puppeteerService.recordRender();
            return pdfBuffer;
        } finally {
            if (page) {
                await page.close().catch(() => { });
            }
        }
    };

    try {
        return await doRenderAttempt();
    } catch (error) {
        const isCrash = error?.message?.includes("disconnected") ||
            error?.message?.includes("Session closed") ||
            error?.message?.includes("Target closed") ||
            error?.message?.includes("Protocol error");

        if (isCrash) {
            console.warn("[PDF] Browser crash detected — relaunching and retrying once...", error.message);
            // Force the browser singleton to relaunch
            await puppeteerService.closeBrowser().catch(() => { });
            try {
                return await doRenderAttempt();
            } catch (retryError) {
                console.error("[PDF] Retry after crash also failed:", retryError);
                throw retryError;
            }
        }

        console.error("Error generating PDF:", error);
        throw error;
    } finally {
        releasePdfRenderSlot();
    }
};

/**
 * Lightweight non-Chromium renderer (pdfkit) for low-memory mode.
 * Best for cost-optimized deployments where minor visual variance is acceptable.
 * @param {Object} quotationData
 * @returns {Promise<Buffer>}
 */
const renderQuotationPDFLightweight = async (quotationData) => {
    const PDFDocument = require("pdfkit");
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 36 });
        const chunks = [];
        doc.on("data", (c) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        const money = (n) => {
            const v = Number(n || 0);
            return `INR ${v.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
        };

        doc.fontSize(16).text("Quotation", { align: "left" });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Quotation No: ${quotationData.quotation_number || "-"}`);
        doc.text(`Date: ${quotationData.quotation_date || "-"}`);
        doc.text(`Valid Till: ${quotationData.valid_till || "-"}`);
        doc.moveDown();

        doc.fontSize(12).text("Customer", { underline: true });
        doc.fontSize(10).text(`Name: ${quotationData.customer_name || "-"}`);
        doc.text(`Mobile: ${quotationData.mobile_number || "-"}`);
        doc.moveDown();

        doc.fontSize(12).text("Project", { underline: true });
        doc.fontSize(10).text(`Capacity (kW): ${quotationData.project_capacity || "-"}`);
        doc.text(`System Cost: ${money(quotationData.system_cost)}`);
        doc.text(`GST: ${money(quotationData.gst_amount)}`);
        doc.text(`Grand Total: ${money(quotationData.grand_total)}`);
        doc.text(`Final Cost: ${money(quotationData.final_cost)}`);
        doc.moveDown();

        doc.fontSize(12).text("Prepared By", { underline: true });
        doc.fontSize(10).text(`Name: ${quotationData.prepared_by?.name || "-"}`);
        doc.text(`Phone: ${quotationData.prepared_by?.phone || "-"}`);
        doc.text(`Email: ${quotationData.prepared_by?.email || "-"}`);
        doc.moveDown();

        doc.fontSize(8).fillColor("#666").text(
            "Note: This PDF is generated in lightweight mode for optimized memory usage. " +
            "Visual layout may differ from the Chromium template output."
        );
        doc.end();
    });
};

/**
 * Generate PDF from quotation data with optional cache + singleflight.
 * @param {Object} quotationData - Complete quotation data object
 * @param {{ bucketClient?: { s3: object, bucketName: string }, templateKey?: string, templateConfig?: object, tenantId?: string|number, quotationId?: string|number, versionKey?: string }} [options]
 * @returns {Promise<Buffer>} PDF file as buffer
 */
const generateQuotationPDF = async (quotationData, options = {}) => {
    const { tenantId, quotationId, versionKey, _metricsContext } = options;

    const hasVersion = tenantId != null && quotationId != null && versionKey;
    const cacheKey = hasVersion ? `${tenantId}:${quotationId}:${versionKey}` : null;

    // 1) Cache hit
    const stageTimings = _metricsContext || {
        fetchDataMs: null,
        resolveAssetsMs: null,
        htmlBuildMs: null,
        pdfRenderMs: null,
        totalMs: null,
    };
    const tStart = Date.now();

    if (PDF_CACHE_ENABLED && cacheKey) {
        const cached = getCachedPdf(cacheKey);
        if (cached) {
            stageTimings.totalMs = Date.now() - tStart;
            recordPdfMetrics(stageTimings, { cacheHit: true, singleflightJoined: false }, options._metricsContext || {});
            return cached;
        }
    }

    const doRender = async (singleflightJoined) => {
        const buffer = await renderQuotationPDF(quotationData, options);
        if (PDF_CACHE_ENABLED && cacheKey) {
            setCachedPdf(cacheKey, buffer);
        }
        stageTimings.totalMs = Date.now() - tStart;
        recordPdfMetrics(stageTimings, { cacheHit: false, singleflightJoined }, options._metricsContext || {});
        return buffer;
    };

    // 2) Singleflight dedupe
    if (PDF_SINGLEFLIGHT_ENABLED && cacheKey) {
        const inFlight = pdfSingleflight.get(cacheKey);
        if (inFlight) {
            return inFlight.finally(() => {
                // Metrics for joined requests are handled by the leader; joined callers just await.
            });
        }
        const promise = (async () => {
            try {
                return await doRender(false);
            } finally {
                pdfSingleflight.delete(cacheKey);
            }
        })();
        pdfSingleflight.set(cacheKey, promise);
        return promise;
    }

    // 3) Plain render (no cache/singleflight)
    return doRender(false);
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
 * Get make logos as base64 data URLs from IDs array (supports bucket key or legacy path).
 * When tenantId is passed, results are cached in pdfImageCache for reuse across PDFs.
 * When logoCache (Map<path, Promise<dataUrl>>) is passed, same logo path is only fetched once per PDF.
 * @param {Array|null} makeIds - Array of ProductMake IDs
 * @param {Map} productMakesMap - Map of ID to {name, logo}
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @param {string|number|null} [tenantId] - Optional tenant ID for pdfImageCache (caches make logos)
 * @param {Map<string, Promise<string>>} [logoCache] - Optional per-request cache: logo path -> Promise<dataUrl> (dedupes fetches within one PDF)
 * @returns {Promise<Array>} Array of objects with name and logoDataUrl
 */
const getMakeLogos = async (makeIds, productMakesMap, bucketClient, tenantId = null, logoCache = null) => {
    if (!makeIds || !Array.isArray(makeIds) || makeIds.length === 0) {
        return [];
    }
    const entries = makeIds
        .map(id => ({ id, make: productMakesMap.get(parseInt(id)) }))
        .filter(e => e.make && e.make.logo);

    const pathToDataUrlOpts = tenantId != null ? { tenantId } : {};
    const results = await Promise.all(
        entries.map(async ({ make }) => {
            const ext = path.extname(make.logo).toLowerCase();
            const mimeType = ext === ".png" ? "image/png" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
            let promise = logoCache && logoCache.get(make.logo);
            if (!promise) {
                promise = pathToDataUrl(make.logo, mimeType, bucketClient, pathToDataUrlOpts);
                if (logoCache) logoCache.set(make.logo, promise);
            }
            const logoDataUrl = await promise;
            return logoDataUrl ? { name: make.name, logo: logoDataUrl } : null;
        })
    );
    return results.filter(Boolean);
};

const normType = (s) => (s || "").toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");

/**
 * Derive BOM section data (panel, inverter, structure, cables, balance_of_system, etc.)
 * from normalized bom_snapshot so the section-based PDF layout can be populated when
 * quotation has bom_snapshot but flat fields are empty.
 * @param {Array} normalizedBomSnapshot - Array of flat BOM lines (product_type_name, product_make_name, capacity, quantity, etc.)
 * @param {Map} productMakesMap - Map of ProductMake ID to { name, logo }
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @param {string|number|null} [tenantId] - Optional tenant ID for make-logo cache
 * @param {Map<string, Promise<string>>} [logoCache] - Optional per-request logo path -> Promise<dataUrl> (dedupes within one PDF)
 * @returns {Promise<Object>} Section objects: panel, inverter, hybrid_inverter, battery, cables, structure, balance_of_system
 */
const deriveBomSectionsFromSnapshot = async (normalizedBomSnapshot, productMakesMap, bucketClient, tenantId = null, logoCache = null) => {
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

    const structure_items = [];
    const accessories_items = [];
    const cables_ac_items = [];
    const cables_dc_items = [];
    const cables_la_items = [];
    const cables_earthing_items = [];

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
            structure_items.push({
                product_name: productName,
                quantity: qty,
                measurement_unit_name: unit,
                product_make_name: makeName,
                product_make_id: makeId,
            });
        } else if (typeNorm === "accessories") {
            accessories_items.push({
                product_name: productName,
                quantity: qty,
                measurement_unit_name: unit,
                product_make_name: makeName,
                product_make_id: makeId,
            });
        } else if (typeNorm === "ac_cable") {
            cables.ac_cable_make = makeName || cables.ac_cable_make;
            cables.ac_cable_qty = (qty > 0 ? String(qty) : cables.ac_cable_qty) || "";
            if (productName) cables.ac_cable_description = productName;
            cables_ac_items.push({
                product_name: productName,
                quantity: qty,
                measurement_unit_name: unit,
                product_make_name: makeName,
                product_make_id: makeId,
            });
        } else if (typeNorm === "dc_cable") {
            cables.dc_cable_make = makeName || cables.dc_cable_make;
            cables.dc_cable_qty = (qty > 0 ? String(qty) : cables.dc_cable_qty) || "";
            if (productName) cables.dc_cable_description = productName;
            cables_dc_items.push({
                product_name: productName,
                quantity: qty,
                measurement_unit_name: unit,
                product_make_name: makeName,
                product_make_id: makeId,
            });
        } else if (typeNorm === "earthing_cable") {
            cables.earthing_make = makeName || cables.earthing_make;
            cables.earthing_qty = (qty > 0 ? String(qty) : cables.earthing_qty) || "";
            cables.earthing_description = productName || cables.earthing_description;
            if (productName && !balance_of_system.earthing) balance_of_system.earthing = productName;
            cables_earthing_items.push({
                product_name: productName,
                quantity: qty,
                measurement_unit_name: unit,
                product_make_name: makeName,
                product_make_id: makeId,
            });
        } else if (typeNorm === "la_cable") {
            cables.la_make = makeName || cables.la_make;
            cables.la_qty = (qty > 0 ? String(qty) : cables.la_qty) || "";
            cables.la_description = productName || cables.la_description;
            balance_of_system.lightening_arrestor = productName || makeName || balance_of_system.lightening_arrestor;
            cables_la_items.push({
                product_name: productName,
                quantity: qty,
                measurement_unit_name: unit,
                product_make_name: makeName,
                product_make_id: makeId,
            });
        } else if (typeNorm === "acdb") {
            balance_of_system.acdb = productName || makeName || balance_of_system.acdb;
        } else if (typeNorm === "dcdb") {
            balance_of_system.dcdb = productName || makeName || balance_of_system.dcdb;
        }
    }
    panel.make_logos = await getMakeLogos([...new Set(panelMakeIds)], productMakesMap, bucketClient, tenantId, logoCache);
    inverter.make_logos = await getMakeLogos([...new Set(inverterMakeIds)], productMakesMap, bucketClient, tenantId, logoCache);
    hybrid_inverter.make_logos = await getMakeLogos([...new Set(hybridInverterMakeIds)], productMakesMap, bucketClient, tenantId, logoCache);
    battery.make_logos = await getMakeLogos([...new Set(batteryMakeIds)], productMakesMap, bucketClient, tenantId, logoCache);

    const resolveMakeLogosForItems = async (items) => {
        return Promise.all(
            items.map(async (item) => {
                const make_logos = item.product_make_id != null && !Number.isNaN(parseInt(item.product_make_id, 10))
                    ? await getMakeLogos([parseInt(item.product_make_id, 10)], productMakesMap, bucketClient)
                    : [];
                return { ...item, make_logos };
            })
        );
    };

    const [structureItemsWithLogos, accessoriesItemsWithLogos, cablesAcWithLogos, cablesDcWithLogos, cablesLaWithLogos, cablesEarthingWithLogos] = await Promise.all([
        resolveMakeLogosForItems(structure_items),
        resolveMakeLogosForItems(accessories_items),
        resolveMakeLogosForItems(cables_ac_items),
        resolveMakeLogosForItems(cables_dc_items),
        resolveMakeLogosForItems(cables_la_items),
        resolveMakeLogosForItems(cables_earthing_items),
    ]);

    return {
        panel,
        inverter,
        hybrid_inverter,
        battery,
        cables,
        structure,
        balance_of_system,
        structure_items: structureItemsWithLogos,
        accessories_items: accessoriesItemsWithLogos,
        cables_ac_items: cablesAcWithLogos,
        cables_dc_items: cablesDcWithLogos,
        cables_la_items: cablesLaWithLogos,
        cables_earthing_items: cablesEarthingWithLogos,
    };
};

/**
 * Prepare quotation data for PDF generation
 * @param {Object} quotation - Raw quotation from database
 * @param {Object} company - Company profile data
 * @param {Object} bankAccount - Bank account details
 * @param {Map} productMakesMap - Map of ProductMake ID to name
 * @param {{ s3: object, bucketName: string }} [bucketClient] - Optional tenant bucket client
 * @param {string|number|null} [tenantId] - Optional tenant ID for make-logo and image cache
 * @returns {Promise<Object>} Formatted data for PDF templates
 */
const prepareQuotationData = async (quotation, company, bankAccount, productMakesMap = new Map(), bucketClient, tenantId = null) => {
    const logoCache = new Map();
    // Calculate derived values
    const projectCapacity = parseFloat(quotation.project_capacity) || 0;
    const pricePerKw = parseFloat(quotation.price_per_kw) || 0;
    const systemCost = projectCapacity * pricePerKw;
    const gstPercent = parseFloat(quotation.gst_rate) || 0;
    const gstAmount = systemCost * (gstPercent / 100);
    const gedaAmount = parseFloat(quotation.state_government_amount) || 0;
    const netMeteringCost = parseFloat(quotation.netmeter_amount) || 0;
    const grandTotal = systemCost + gstAmount + gedaAmount + netMeteringCost;
    const subsidyAmount = parseMoney(quotation.subsidy_amount);
    const stateSubsidyAmount = parseMoney(quotation.state_subsidy_amount);
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

    // Build BOM section data from quotation flat fields (logoCache dedupes same logo across sections within this PDF)
    const [panelLogos, inverterLogos, hybridInverterLogos, batteryLogos] = await Promise.all([
        getMakeLogos(quotation.panel_make_ids, productMakesMap, bucketClient, tenantId, logoCache),
        getMakeLogos(quotation.inverter_make_ids, productMakesMap, bucketClient, tenantId, logoCache),
        getMakeLogos(quotation.hybrid_inverter_make_ids, productMakesMap, bucketClient, tenantId, logoCache),
        getMakeLogos(quotation.battery_make_ids, productMakesMap, bucketClient, tenantId, logoCache),
    ]);

    let panel = {
        watt_peak: quotation.panel_size || 0,
        quantity: quotation.panel_quantity || 0,
        type: quotation.panel_type || "",
        make: getMakeNames(quotation.panel_make_ids, productMakesMap),
        warranty: quotation.panel_warranty || 0,
        performance_warranty: quotation.panel_performance_warranty || 0,
        make_logos: panelLogos,
    };
    let inverter = {
        size: quotation.inverter_size || 0,
        quantity: quotation.inverter_quantity || 0,
        make: getMakeNames(quotation.inverter_make_ids, productMakesMap),
        warranty: quotation.inverter_warranty || 0,
        make_logos: inverterLogos,
    };
    let hybrid_inverter = {
        size: quotation.hybrid_inverter_size || 0,
        quantity: quotation.hybrid_inverter_quantity || 0,
        make: getMakeNames(quotation.hybrid_inverter_make_ids, productMakesMap),
        warranty: quotation.hybrid_inverter_warranty || "",
        make_logos: hybridInverterLogos,
    };
    let battery = {
        size: quotation.battery_size || 0,
        quantity: quotation.battery_quantity || 0,
        type: quotation.battery_type || "",
        make: getMakeNames(quotation.battery_make_ids, productMakesMap),
        warranty: quotation.battery_warranty || "",
        make_logos: batteryLogos,
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

    const normalizedBomSnapshotForTable =
        Array.isArray(quotation.bom_snapshot) && quotation.bom_snapshot.length > 0
            ? normalizeBomSnapshotForDisplay(quotation.bom_snapshot)
            : null;

    let structure_items = [];
    let accessories_items = [];
    let cables_ac_items = [];
    let cables_dc_items = [];
    let cables_la_items = [];
    let cables_earthing_items = [];

    // When quotation has bom_snapshot, derive section data from it so section-based BOM page is populated.
    // Snapshot data should drive the BOM composition (size, qty, make, etc.) but we KEEP warranty fields
    // from the quotation form (since BOM lines typically don't carry warranty info).
    if (Array.isArray(quotation.bom_snapshot) && quotation.bom_snapshot.length > 0) {
        const normalizedSnapshot = normalizeBomSnapshotForDisplay(quotation.bom_snapshot);
        const derived = await deriveBomSectionsFromSnapshot(normalizedSnapshot, productMakesMap, bucketClient, tenantId, logoCache);
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
            structure_items = derived.structure_items || [];
            accessories_items = derived.accessories_items || [];
            cables_ac_items = derived.cables_ac_items || [];
            cables_dc_items = derived.cables_dc_items || [];
            cables_la_items = derived.cables_la_items || [];
            cables_earthing_items = derived.cables_earthing_items || [];
        }
    }

    const hasCablesItems = cables_ac_items.length > 0 || cables_dc_items.length > 0 || cables_la_items.length > 0 || cables_earthing_items.length > 0;

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
        gst_percent: gstPercent > 0 ? gstPercent : null,
        gst_amount: gstAmount > 0 ? gstAmount : null,
        net_metering_cost: netMeteringCost,
        geda_amount: gedaAmount,
        grand_total: grandTotal,
        subsidy_amount: subsidyAmount,
        state_subsidy_amount: stateSubsidyAmount,
        total_subsidy_amount: totalSubsidy,
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
                upi_id: bankAccount.upi_id || "",
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
        structure_items,
        accessories_items,
        cables_ac_items,
        cables_dc_items,
        cables_la_items,
        cables_earthing_items,

        // Only show BOM sections when qty > 0 (optional products hidden)
        bom_show_panel: (parseFloat(panel.quantity) || 0) > 0,
        bom_show_inverter: (parseFloat(inverter.quantity) || 0) > 0,
        bom_show_hybrid_inverter: (parseFloat(hybrid_inverter.quantity) || 0) > 0,
        bom_show_battery: (parseFloat(battery.quantity) || 0) > 0,
        bom_show_cables:
            hasCablesItems ||
            (parseFloat(cables.ac_cable_qty) || 0) > 0 ||
            (parseFloat(cables.dc_cable_qty) || 0) > 0 ||
            (parseFloat(cables.earthing_qty) || 0) > 0 ||
            (parseFloat(cables.la_qty) || 0) > 0,
        bom_show_structure:
            structure_items.length > 0 ||
            (parseFloat(structure.height) || 0) > 0 ||
            (structure.material != null && String(structure.material).trim() !== ""),
        bom_show_accessories: accessories_items.length > 0,
        bom_show_balance_of_system:
            Boolean(
                (balance_of_system.acdb != null && String(balance_of_system.acdb).trim() !== "") ||
                (balance_of_system.dcdb != null && String(balance_of_system.dcdb).trim() !== "") ||
                (balance_of_system.earthing != null && String(balance_of_system.earthing).trim() !== "") ||
                (balance_of_system.lightening_arrestor != null && String(balance_of_system.lightening_arrestor).trim() !== "") ||
                (balance_of_system.miscellaneous != null && String(balance_of_system.miscellaneous).trim() !== "")
            ),

        // BOM table: include ALL items from bom_snapshot (duplicates included).
        // Template will render this in the Bill Of Material page.
        bom_snapshot_table: normalizedBomSnapshotForTable || [],

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

function setTemplateAssetDataUrl(tenantId, keyOrPath, dataUrl) {
    setImageDataUrl(tenantId, keyOrPath, dataUrl);
}

module.exports = {
    generateQuotationPDF,
    prepareQuotationData,
    buildHtmlDocument,
    invalidatePdfCacheForTenant,
    setTemplateAssetDataUrl,
};
