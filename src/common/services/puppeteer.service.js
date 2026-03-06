"use strict";

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
const fs = require("fs");

// @sparticuz/chromium ships a Linux x64 serverless-optimized binary.
// On macOS/Windows (local dev) we fall back to the system Chrome/Chromium.
// On Linux (Docker / DigitalOcean) we use the @sparticuz/chromium binary.

const CHROMIUM_HEAP_MB = Math.max(128, parseInt(process.env.PUPPETEER_JS_MAX_OLD_SPACE_SIZE || "256", 10));
const JS_FLAGS_HEAP = `--js-flags=--max-old-space-size=${CHROMIUM_HEAP_MB}`;
const MAX_RENDERS_BEFORE_RESTART = Math.max(1, parseInt(process.env.PDF_CHROMIUM_MAX_RENDERS || "50", 10));
const MAX_AGE_MS_BEFORE_RESTART = Math.max(60_000, parseInt(process.env.PDF_CHROMIUM_MAX_AGE_MS || "1800000", 10)); // 30 min default

const LOCAL_CHROME_CANDIDATES = [
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    // Linux system chrome (fallback if sparticuz binary missing)
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    // Windows
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

/**
 * Resolve launch options for the current platform.
 * - Linux (production Docker): @sparticuz/chromium binary + its memory-optimized args
 * - macOS/Windows (local dev): system Chrome + basic sandbox-disable args
 */
async function getLaunchConfig() {
    // Allow hard override via env (useful for CI or custom setups)
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (envPath && fs.existsSync(envPath)) {
        return {
            executablePath: envPath,
            args: [...(Array.isArray(chromium.args) ? chromium.args : []), JS_FLAGS_HEAP],
            headless: true,
        };
    }

    if (process.platform === "linux") {
        // Production path: use @sparticuz/chromium (Linux x64 serverless binary)
        return {
            executablePath: await chromium.executablePath(),
            args: [...(Array.isArray(chromium.args) ? chromium.args : []), JS_FLAGS_HEAP],
            headless: chromium.headless,
        };
    }

    // Local dev (macOS / Windows): use system Chrome
    const executablePath = LOCAL_CHROME_CANDIDATES.find((p) => fs.existsSync(p));
    if (!executablePath) {
        throw new Error(
            "No Chrome/Chromium found for local development. " +
            "Install Google Chrome or set PUPPETEER_EXECUTABLE_PATH."
        );
    }
    return {
        executablePath,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            JS_FLAGS_HEAP,
        ],
        headless: true,
    };
}

let _browserInstance = null;
let _browserLaunchPromise = null;
let _renderCount = 0;
let _browserLaunchedAt = 0;

/**
 * Get or create a persistent browser instance (avoids cold-start on every PDF).
 * Callers should use newPage() on the returned browser and close the page when done.
 * The browser itself stays alive for reuse.
 */
async function getBrowser() {
    if (_browserInstance && _browserInstance.isConnected()) {
        return _browserInstance;
    }
    if (_browserLaunchPromise) return _browserLaunchPromise;

    _browserLaunchPromise = (async () => {
        const config = await getLaunchConfig();
        _browserInstance = await puppeteer.launch(config);
        _renderCount = 0;
        _browserLaunchedAt = Date.now();
        _browserInstance.on("disconnected", () => {
            _browserInstance = null;
            _browserLaunchPromise = null;
        });
        _browserLaunchPromise = null;
        return _browserInstance;
    })();
    return _browserLaunchPromise;
}

/**
 * Call after each PDF render. Restarts Chromium after N renders or M minutes to cap memory growth.
 */
function recordRender() {
    _renderCount += 1;
    const ageMs = _browserLaunchedAt ? Date.now() - _browserLaunchedAt : 0;
    if (
        _renderCount >= MAX_RENDERS_BEFORE_RESTART ||
        ageMs >= MAX_AGE_MS_BEFORE_RESTART
    ) {
        closeBrowser().catch(() => { });
    }
}

/**
 * Gracefully close the persistent browser (call on process shutdown).
 */
async function closeBrowser() {
    if (_browserInstance) {
        await _browserInstance.close().catch(() => { });
        _browserInstance = null;
        _browserLaunchPromise = null;
    }
    _renderCount = 0;
    _browserLaunchedAt = 0;
}

process.on("SIGTERM", closeBrowser);
process.on("SIGINT", closeBrowser);

module.exports = {
    getBrowser,
    closeBrowser,
    recordRender,
};
