"use strict";

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// Production-hardened Chromium args.
// Goal: minimise peak memory when rendering PDF pages with large embedded images.
const DEFAULT_ARGS = [
    // Security / sandbox
    "--no-sandbox",
    "--disable-setuid-sandbox",

    // Memory: use /tmp instead of /dev/shm (avoids 64 MB shared-mem limit in Docker/Linux)
    "--disable-dev-shm-usage",

    // Rendering: disable GPU (headless server has no GPU)
    "--disable-gpu",
    "--disable-software-rasterizer",

    // Memory reduction: disable unused subsystems
    "--disable-extensions",
    "--disable-plugins",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",
    "--disable-client-side-phishing-detection",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-features=AudioServiceOutOfProcess,TranslateUI",
    "--disable-hang-monitor",
    "--disable-ipc-flooding-protection",
    "--disable-notifications",
    "--disable-offer-store-unmasked-wallet-cards",
    "--disable-popup-blocking",
    "--disable-print-preview",
    "--disable-prompt-on-repost",
    "--disable-renderer-backgrounding",
    "--disable-speech-api",
    "--disable-sync",
    "--disable-translate",
    "--hide-scrollbars",
    "--ignore-gpu-blocklist",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-pings",
    "--no-zygote",
    "--password-store=basic",
    "--safebrowsing-disable-auto-update",
    "--use-mock-keychain",
];

/**
 * Resolve Chrome/Chromium executable path: env → OS candidates → Puppeteer fallback.
 * @returns {string|null} Absolute path to executable, or null if none found.
 */
function findChromePath() {
    // 1. Env (Puppeteer Docker image / CI)
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (envPath && fs.existsSync(envPath)) {
        return envPath;
    }

    // 2. OS-specific candidates
    const candidates = [
        // macOS
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        // Linux (including Puppeteer Docker image)
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        // Windows
        path.join("C:", "Program Files", "Google", "Chrome", "Application", "chrome.exe"),
        path.join("C:", "Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    // 3. Puppeteer fallback
    try {
        if (typeof puppeteer.executablePath === "function") {
            const fallback = puppeteer.executablePath();
            if (fallback && fs.existsSync(fallback)) {
                return fallback;
            }
        } else if (puppeteer.executablePath && fs.existsSync(puppeteer.executablePath)) {
            return puppeteer.executablePath;
        }
    } catch (_) {
        // ignore
    }

    return null;
}

/**
 * Get launch options for puppeteer.launch(): executablePath (when found), headless, args.
 * Merges overrides so callers can add timeout, extra args, etc.
 * @param {Object} [overrides={}] - Options to merge (e.g. { timeout: 60000 })
 * @returns {Object} Options object for puppeteer.launch()
 */
function getLaunchOptions(overrides = {}) {
    const chromePath = findChromePath();
    const base = {
        headless: true,
        args: [...DEFAULT_ARGS],
    };
    if (chromePath) {
        base.executablePath = chromePath;
    } else {
        console.warn("No Chrome/Chromium binary found — falling back to Puppeteer default.");
    }
    return { ...base, ...overrides };
}

let _browserInstance = null;
let _browserLaunchPromise = null;

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
        _browserInstance = await puppeteer.launch(getLaunchOptions());
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
 * Gracefully close the persistent browser (call on process shutdown).
 */
async function closeBrowser() {
    if (_browserInstance) {
        await _browserInstance.close().catch(() => { });
        _browserInstance = null;
        _browserLaunchPromise = null;
    }
}

process.on("SIGTERM", closeBrowser);
process.on("SIGINT", closeBrowser);

module.exports = {
    findChromePath,
    getLaunchOptions,
    getBrowser,
    closeBrowser,
};
