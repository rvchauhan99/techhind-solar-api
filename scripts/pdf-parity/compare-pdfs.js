#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

async function fetchPdf(url, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch failed ${res.status} ${url} ${text.slice(0, 120)}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function estimatePageCount(buf) {
  // Lightweight heuristic for CI without extra native deps.
  const text = buf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

function pctDelta(a, b) {
  if (!a && !b) return 0;
  if (!a) return 100;
  return Math.abs(((b - a) / a) * 100);
}

async function main() {
  const casesPath = process.argv[2] || path.join(__dirname, "cases.json");
  if (!fs.existsSync(casesPath)) {
    throw new Error(`Cases file not found: ${casesPath}`);
  }
  const raw = fs.readFileSync(casesPath, "utf8");
  const cfg = JSON.parse(raw);
  const baselineBaseUrl = cfg.baselineBaseUrl;
  const candidateBaseUrl = cfg.candidateBaseUrl;
  const maxSizeDeltaPct = Number(cfg.maxSizeDeltaPct || 15);
  const maxPageDelta = Number(cfg.maxPageDelta || 0);
  const token = cfg.token || process.env.PDF_PARITY_TOKEN || "";
  const cases = Array.isArray(cfg.cases) ? cfg.cases : [];
  if (!baselineBaseUrl || !candidateBaseUrl || cases.length === 0) {
    throw new Error("cases.json must include baselineBaseUrl, candidateBaseUrl, and non-empty cases[]");
  }

  let failed = 0;
  for (const item of cases) {
    const pathPart = item.path;
    const baselineUrl = `${baselineBaseUrl.replace(/\/$/, "")}${pathPart}`;
    const candidateUrl = `${candidateBaseUrl.replace(/\/$/, "")}${pathPart}`;
    const [a, b] = await Promise.all([fetchPdf(baselineUrl, token), fetchPdf(candidateUrl, token)]);
    const result = {
      case: item.name || pathPart,
      path: pathPart,
      baselineBytes: a.length,
      candidateBytes: b.length,
      sizeDeltaPct: Number(pctDelta(a.length, b.length).toFixed(2)),
      baselinePages: estimatePageCount(a),
      candidatePages: estimatePageCount(b),
      baselineSha256: sha256(a),
      candidateSha256: sha256(b),
    };

    const pageDelta = Math.abs(result.candidatePages - result.baselinePages);
    const sizeFail = result.sizeDeltaPct > maxSizeDeltaPct;
    const pageFail = pageDelta > maxPageDelta;
    const pass = !sizeFail && !pageFail;
    if (!pass) failed += 1;
    console.log(JSON.stringify({ ...result, pass }, null, 2));
  }

  if (failed > 0) {
    throw new Error(`PDF parity failed for ${failed} case(s).`);
  }
}

main().catch((err) => {
  console.error("[pdf-parity] ERROR:", err.message);
  process.exit(1);
});

