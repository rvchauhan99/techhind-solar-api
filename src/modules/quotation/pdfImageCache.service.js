"use strict";

const CACHE_MAX_ENTRIES = Math.max(
  1,
  parseInt(process.env.PDF_IMAGE_CACHE_MAX_ENTRIES || "300", 10)
);
const CACHE_MAX_BYTES =
  parseInt(process.env.PDF_IMAGE_CACHE_MAX_BYTES || "0", 10) ||
  40 * 1024 * 1024; // 40MB default

const imageDataUrlCache = new Map(); // "tenantId:normalizedKey" -> { dataUrl, ts, bytes }
let imageDataUrlCacheTotalBytes = 0;

function normalizeImageKey(keyOrPath) {
  if (keyOrPath == null) return null;
  const raw = String(keyOrPath).trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/uploads/")) return raw.slice(1);
  return raw;
}

function buildCacheKey(tenantId, keyOrPath) {
  if (tenantId == null) return null;
  const normalized = normalizeImageKey(keyOrPath);
  if (!normalized) return null;
  return `${tenantId}:${normalized}`;
}

function getImageDataUrl(tenantId, keyOrPath) {
  const cacheKey = buildCacheKey(tenantId, keyOrPath);
  if (!cacheKey) return null;
  const entry = imageDataUrlCache.get(cacheKey);
  return entry ? entry.dataUrl : null;
}

function evictOldestCacheEntry() {
  let oldestKey = null;
  let oldestTs = Infinity;
  for (const [key, value] of imageDataUrlCache) {
    if (value.ts < oldestTs) {
      oldestTs = value.ts;
      oldestKey = key;
    }
  }
  if (oldestKey == null) return;
  const removed = imageDataUrlCache.get(oldestKey);
  if (removed && removed.bytes) {
    imageDataUrlCacheTotalBytes -= removed.bytes;
  }
  imageDataUrlCache.delete(oldestKey);
}

function setImageDataUrl(tenantId, keyOrPath, dataUrl) {
  if (!dataUrl) return;
  const cacheKey = buildCacheKey(tenantId, keyOrPath);
  if (!cacheKey) return;

  const bytes = Buffer.byteLength(dataUrl, "utf8");
  const existing = imageDataUrlCache.get(cacheKey);
  if (existing && existing.bytes) {
    imageDataUrlCacheTotalBytes -= existing.bytes;
  }

  while (
    imageDataUrlCache.size >= CACHE_MAX_ENTRIES ||
    (CACHE_MAX_BYTES > 0 && imageDataUrlCacheTotalBytes + bytes > CACHE_MAX_BYTES)
  ) {
    if (imageDataUrlCache.size === 0) break;
    evictOldestCacheEntry();
  }

  imageDataUrlCache.set(cacheKey, { dataUrl, ts: Date.now(), bytes });
  imageDataUrlCacheTotalBytes += bytes;
}

function getImageCacheStats() {
  return {
    entries: imageDataUrlCache.size,
    totalBytes: imageDataUrlCacheTotalBytes,
  };
}

module.exports = {
  normalizeImageKey,
  getImageDataUrl,
  setImageDataUrl,
  getImageCacheStats,
};
