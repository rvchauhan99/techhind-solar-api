"use strict";

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;
const KEY_ITERATIONS = 100000;

/**
 * Derive a 32-byte key from MASTER_ENCRYPTION_KEY.
 * @returns {Buffer}
 */
function getKey() {
  const master = process.env.MASTER_ENCRYPTION_KEY;
  if (!master || typeof master !== "string") {
    const err = new Error("MASTER_ENCRYPTION_KEY is required and must be a non-empty string");
    err.code = "CRYPTO_CONFIG_MISSING";
    throw err;
  }
  return crypto.pbkdf2Sync(master, "tenant-registry-salt", KEY_ITERATIONS, KEY_LENGTH, "sha256");
}

/**
 * Encrypt plaintext with AES-256-GCM. Do not log the result.
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Base64-encoded iv:authTag:ciphertext
 */
function encrypt(text) {
  if (text == null || text === "") return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, enc]).toString("base64");
}

/**
 * Decrypt ciphertext produced by encrypt().
 * @param {string} encrypted - Base64-encoded iv:authTag:ciphertext
 * @returns {string} - Plain text
 */
function decrypt(encrypted) {
  if (encrypted == null || encrypted === "") return "";
  const key = getKey();
  const buf = Buffer.from(encrypted, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    const err = new Error("Invalid encrypted payload");
    err.code = "CRYPTO_DECRYPT_FAILED";
    throw err;
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

module.exports = { encrypt, decrypt };
