"use strict";

const AWS = require("aws-sdk");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const { URL } = require("url");

let s3Client = null;
let bucketName = null;

/**
 * Get S3 client (lazy-init from env). Throws if config is missing.
 * @returns {{ s3: AWS.S3, bucketName: string }}
 */
function getClient() {
  if (s3Client) {
    return { s3: s3Client, bucketName };
  }

  const endpoint = process.env.BUCKET_ENDPOINT;
  const name = process.env.BUCKET_NAME;
  const accessKeyId = process.env.BUCKET_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BUCKET_SECRET_ACCESS_KEY;

  if (!endpoint || !name || !accessKeyId || !secretAccessKey) {
    const err = new Error(
      "Bucket config missing: set BUCKET_ENDPOINT, BUCKET_NAME, BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY"
    );
    err.code = "BUCKET_CONFIG_MISSING";
    throw err;
  }

  const s3Endpoint = new AWS.Endpoint(endpoint);
  s3Client = new AWS.S3({
    endpoint: s3Endpoint,
    accessKeyId,
    secretAccessKey,
    region: process.env.BUCKET_REGION || "auto",
    s3ForcePathStyle: true,
    signatureVersion: "v4", // Required by Cloudflare R2; SigV2 is not supported
  });
  bucketName = name;
  return { s3: s3Client, bucketName };
}

/**
 * Generate file path: prefix/year/month/uniqueFilename
 * @param {string} prefix - e.g. 'purchase-orders', 'quotations'
 * @param {string} originalFilename - original file name
 * @returns {string} - object key
 */
function generateFilePath(prefix, originalFilename) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const fileExtension = path.extname(originalFilename);
  const baseName = path.basename(originalFilename, fileExtension);
  const uniqueId = crypto.randomBytes(8).toString("hex");
  const filename = `${baseName}_${uniqueId}${fileExtension}`;
  return `${prefix}/${year}/${month}/${filename}`;
}

/**
 * Normalize options: support (file, prefix) for backward compat and (file, options).
 * @param {object} file - Multer file or { buffer, originalname, mimetype, size }
 * @param {string|object} optionsOrPrefix - prefix string or options { prefix, acl, contentType, customKey }
 * @returns {{ key: string, body: Buffer, contentType: string, size: number, originalName: string, acl: string }}
 */
function normalizeUploadArgs(file, optionsOrPrefix) {
  const options =
    typeof optionsOrPrefix === "string"
      ? { prefix: optionsOrPrefix, acl: "private" }
      : { acl: "private", ...optionsOrPrefix };

  const prefix = options.prefix || "";
  const acl = options.acl === "public-read" ? "public-read" : "private";
  const contentType = options.contentType || file.mimetype;
  const originalName = file.originalname || "file";
  const size = file.size != null ? file.size : (file.buffer && file.buffer.length) || 0;

  const key = options.customKey
    ? options.customKey
    : prefix
      ? generateFilePath(prefix, originalName)
      : generateFilePath("uploads", originalName);

  return {
    key,
    body: file.buffer,
    contentType,
    size,
    originalName,
    acl,
  };
}

/**
 * Upload a single file.
 * @param {object} file - Multer file or { buffer, originalname, mimetype, size }
 * @param {string|object} optionsOrPrefix - prefix (string) or options { prefix, acl, contentType, customKey }
 * @returns {Promise<{ path: string, filename: string, size: number, mime_type: string, uploaded_at: string }>}
 */
async function uploadFile(file, optionsOrPrefix, client) {
  if (!file) throw new Error("File is required");
  const { s3, bucketName: bucket } = client || getClient();
  const { key, body, contentType, size, originalName, acl } = normalizeUploadArgs(file, optionsOrPrefix);

  const params = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ACL: acl,
  };

  try {
    await s3.upload(params).promise();
    return {
      path: key,
      filename: originalName,
      size,
      mime_type: contentType,
      uploaded_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error uploading file to bucket:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

/**
 * Upload multiple files.
 * @param {object[]} files - Array of Multer/file-like objects
 * @param {string|object} optionsOrPrefix - prefix or options (same as uploadFile)
 * @returns {Promise<Array<{ path, filename, size, mime_type, uploaded_at }>>}
 */
async function uploadMultipleFiles(files, optionsOrPrefix) {
  if (!files || files.length === 0) return [];
  const results = await Promise.all(files.map((file) => uploadFile(file, optionsOrPrefix)));
  return results;
}

const DEFAULT_FETCH_TIMEOUT_MS = 15000;

/**
 * Fetch a file from a URL and upload it to the bucket.
 * @param {string} url - Full HTTP or HTTPS URL to fetch
 * @param {string|object} optionsOrPrefix - prefix (string) or options { prefix, acl, contentType, customKey }
 * @param {{ s3: object, bucketName: string }} [client] - Optional bucket client
 * @returns {Promise<{ path: string, filename: string, size: number, mime_type: string, uploaded_at: string }>}
 */
function uploadFromUrl(url, optionsOrPrefix, client) {
  if (!url || typeof url !== "string") {
    return Promise.reject(new Error("URL is required"));
  }
  const urlStr = url.trim();
  if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
    return Promise.reject(new Error("URL must be http or https"));
  }

  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      reject(new Error(`Invalid URL: ${e.message}`));
      return;
    }

    const protocol = parsed.protocol === "https:" ? https : http;
    const timeoutMs = DEFAULT_FETCH_TIMEOUT_MS;
    const requestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "GET",
      timeout: timeoutMs,
    };

    const req = protocol.request(requestOptions, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        const redirectUrl = res.headers.location;
        res.destroy();
        uploadFromUrl(redirectUrl, optionsOrPrefix, client).then(resolve).catch(reject);
        return;
      }
      if (status < 200 || status >= 300) {
        res.destroy();
        reject(new Error(`HTTP ${status} for ${urlStr}`));
        return;
      }

      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const contentType = (res.headers["content-type"] || "").split(";")[0].trim() || "application/octet-stream";
        const pathname = parsed.pathname || "/";
        const lastSegment = pathname.replace(/\/$/, "").split("/").pop() || "payment-proof";
        const originalname = lastSegment && lastSegment.includes(".") ? lastSegment : `payment-proof_${Date.now()}.jpg`;

        const fileLike = {
          buffer,
          originalname,
          mimetype: contentType,
          size: buffer.length,
        };

        uploadFile(fileLike, optionsOrPrefix, client).then(resolve).catch(reject);
      });
      res.on("error", (err) => reject(err));
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    });
    req.end();
  });
}

/**
 * Delete a single object by key.
 * @param {string} key - Object key
 * @returns {Promise<boolean>}
 */
async function deleteFile(key) {
  if (!key) throw new Error("File path (key) is required");
  const { s3, bucketName: bucket } = getClient();
  try {
    await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
    return true;
  } catch (error) {
    console.error("Error deleting file from bucket:", error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Delete a single object by key using a specific client (for tenant-scoped bucket).
 * @param {{ s3: object, bucketName: string }} client
 * @param {string} key - Object key
 * @returns {Promise<boolean>}
 */
async function deleteFileWithClient(client, key) {
  if (!key) throw new Error("File path (key) is required");
  const { s3, bucketName: bucket } = client;
  try {
    await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
    return true;
  } catch (error) {
    console.error("Error deleting file from bucket:", error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Delete multiple objects by key.
 * @param {string[]} keys - Object keys
 * @returns {Promise<boolean>}
 */
async function deleteMultipleFiles(keys) {
  if (!keys || keys.length === 0) return true;
  await Promise.all(keys.map((key) => deleteFile(key)));
  return true;
}

/**
 * Get a presigned GET URL for private object access.
 * @param {string} key - Object key (bucket path)
 * @param {number} expiresIn - Expiration in seconds (default 3600)
 * @param {{ s3: object, bucketName: string }} [client] - Optional bucket client; uses default if null/undefined
 * @returns {Promise<string>}
 */
async function getSignedUrl(key, expiresIn = 3600, client) {
  const k = key != null ? String(key).trim() : "";
  if (!k) throw new Error("File path (key) is required");
  const { s3, bucketName: bucket } = client || getClient();
  try {
    const url = await s3.getSignedUrlPromise("getObject", {
      Bucket: bucket,
      Key: k,
      Expires: expiresIn,
    });
    return url;
  } catch (error) {
    console.error("Error generating signed URL:", error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}

/**
 * Get signed URL for request context. Tries tenant bucket first; on failure, falls back to default bucket.
 * Use when the object may have been stored in the default bucket (e.g. tenant bucket fallback on upload).
 * @param {object} req - Express request with req.tenant
 * @param {string} key - Bucket object key (document_path)
 * @param {number} [expiresIn] - Expiration in seconds (default 3600)
 * @returns {Promise<string>}
 */
async function getSignedUrlForRequest(req, key, expiresIn = 3600) {
  const bucketClient = getBucketForRequest(req);
  try {
    return await getSignedUrl(key, expiresIn, bucketClient);
  } catch (err) {
    if (req?.tenant?.bucket && bucketClient) {
      try {
        return await getSignedUrl(key, expiresIn, null);
      } catch (fallbackErr) {
        console.error("Fallback getSignedUrl (default bucket) failed:", fallbackErr);
        throw err;
      }
    }
    throw err;
  }
}

/**
 * Get public URL for an object. Uses BUCKET_PUBLIC_URL_BASE if set (e.g. R2 custom domain), otherwise builds from endpoint + bucket + key.
 * @param {string} key - Object key
 * @returns {string}
 */
function getPublicUrl(key) {
  if (!key) throw new Error("File path (key) is required");
  const base = process.env.BUCKET_PUBLIC_URL_BASE;
  if (base) {
    const normalized = base.replace(/\/$/, "");
    return `${normalized}/${key}`;
  }
  const { bucketName: bucket } = getClient();
  const endpoint = process.env.BUCKET_ENDPOINT || "";
  // Some S3-compatible endpoints don't support public URLs without custom domain
  return `${endpoint}/${bucket}/${key}`;
}

/**
 * Get object as buffer (server-side).
 * @param {string} key - Object key
 * @returns {Promise<{ body: Buffer, contentType?: string }>}
 */
async function getObject(key) {
  if (!key) throw new Error("File path (key) is required");
  const { s3, bucketName: bucket } = getClient();
  try {
    const result = await s3.getObject({ Bucket: bucket, Key: key }).promise();
    return {
      body: result.Body,
      contentType: result.ContentType,
    };
  } catch (error) {
    console.error("Error getting object from bucket:", error);
    throw new Error(`Failed to get object: ${error.message}`);
  }
}

/**
 * Head object (metadata). Throws if not found.
 * @param {string} key - Object key
 * @returns {Promise<object>} - Metadata from HeadObject
 */
async function headObject(key) {
  if (!key) throw new Error("File path (key) is required");
  const { s3, bucketName: bucket } = getClient();
  const result = await s3.headObject({ Bucket: bucket, Key: key }).promise();
  return result;
}

/**
 * Check if object exists.
 * @param {string} key - Object key
 * @returns {Promise<boolean>}
 */
async function fileExists(key) {
  if (!key) return false;
  try {
    await headObject(key);
    return true;
  } catch (error) {
    if (error.code === "NotFound" || error.statusCode === 404) return false;
    throw error;
  }
}

/**
 * List objects with optional prefix and pagination.
 * @param {object} options - { prefix?, maxKeys?, continuationToken? }
 * @returns {Promise<{ keys: string[], continuationToken?: string }>}
 */
async function listObjects(options = {}) {
  const { s3, bucketName: bucket } = getClient();
  const params = {
    Bucket: bucket,
    Prefix: options.prefix || "",
    MaxKeys: options.maxKeys || 1000,
  };
  if (options.continuationToken) params.ContinuationToken = options.continuationToken;

  const result = await s3.listObjectsV2(params).promise();
  const keys = (result.Contents || []).map((item) => item.Key);
  return {
    keys,
    continuationToken: result.IsTruncated ? result.NextContinuationToken : undefined,
  };
}

/**
 * Copy object within the same bucket.
 * @param {string} sourceKey - Source object key
 * @param {string} destKey - Destination object key
 * @param {object} options - { acl?, metadata? }
 * @returns {Promise<object>}
 */
async function copyObject(sourceKey, destKey, options = {}) {
  if (!sourceKey || !destKey) throw new Error("sourceKey and destKey are required");
  const { s3, bucketName: bucket } = getClient();
  const copySource = `${bucket}/${sourceKey}`;
  const params = {
    Bucket: bucket,
    Key: destKey,
    CopySource: copySource,
  };
  if (options.acl) params.ACL = options.acl;
  if (options.metadata) params.Metadata = options.metadata;
  const result = await s3.copyObject(params).promise();
  return result;
}

/**
 * Get bucket client for the current request. Use req.tenant.bucket when available (tenant context), else default from env.
 * @param {object} req - Express request (may have req.tenant.bucket)
 * @returns {{ s3: AWS.S3, bucketName: string }}
 */
function getBucketForRequest(req) {
  if (req?.tenant?.bucket) return req.tenant.bucket;
  return getClient();
}

/**
 * Get object from bucket using a specific client (for tenant-scoped bucket).
 * @param {{ s3: AWS.S3, bucketName: string }} client
 * @param {string} key
 * @returns {Promise<{ body: Buffer, contentType?: string }>}
 */
async function getObjectWithClient(client, key) {
  if (!key) throw new Error("File path (key) is required");
  const { s3, bucketName: bucket } = client;
  const result = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  return {
    body: result.Body,
    contentType: result.ContentType,
  };
}

module.exports = {
  getClient,
  getBucketForRequest,
  getSignedUrlForRequest,
  getObjectWithClient,
  generateFilePath,
  uploadFile,
  uploadFromUrl,
  uploadMultipleFiles,
  deleteFile,
  deleteFileWithClient,
  deleteMultipleFiles,
  getSignedUrl,
  getPublicUrl,
  getObject,
  headObject,
  fileExists,
  listObjects,
  copyObject,
};
