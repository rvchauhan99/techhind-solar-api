"use strict";

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const DEFAULT_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
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

module.exports = {
    findChromePath,
    getLaunchOptions,
};
