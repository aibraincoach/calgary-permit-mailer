const axios = require('axios');
const util = require('util');

const DEFAULT_BASE =
  process.env.POSTGRID_API_BASE || 'https://api.postgrid.com/print-mail/v1';

/** Default PostGrid `from` name when POSTGRID_FROM_FIRST_NAME is unset. */
const SENDER_BRAND_FIRST_NAME = 'AI Brain Coach';
const SENDER_BRAND_LAST_NAME = '';

const DISPLAY_POSTAL_FALLBACK = 'T2H 0A1';

/**
 * Collect string values that look like HTTP(S) URLs from a nested object.
 * @param {unknown} obj
 * @param {string} path
 * @param {number} depth
 * @param {Array<{ path: string, value: string }>} out
 */
function collectHttpsUrlStrings(obj, path, depth, out) {
  if (depth > 10 || obj == null) return out;
  if (typeof obj === 'string') {
    const t = obj.trim();
    if (/^https?:\/\//i.test(t)) out.push({ path: path || '(root)', value: t });
    return out;
  }
  if (typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      collectHttpsUrlStrings(obj[i], `${path}[${i}]`, depth + 1, out);
    }
    return out;
  }
  for (const k of Object.keys(obj)) {
    const p = path ? `${path}.${k}` : k;
    collectHttpsUrlStrings(obj[k], p, depth + 1, out);
  }
  return out;
}

function scorePdfUrlCandidate(path, value) {
  const pl = path.toLowerCase();
  const vl = value.toLowerCase();
  let s = 0;
  if (/\burl\b/.test(pl) && !/\bhtml\b/.test(pl)) s += 6;
  if (/\bpdf\b/.test(pl)) s += 10;
  if (/\bpreview\b/.test(pl)) s += 5;
  if (/\bfile\b/.test(pl)) s += 2;
  if (vl.includes('.pdf') || vl.includes('pdf')) s += 4;
  if (vl.includes('amazonaws.com') || vl.includes('postgrid')) s += 5;
  if (/\blogo\b|\bicon\b|\bavatar\b|\bphoto\b/.test(pl)) s -= 20;
  return s;
}

/**
 * Extract PDF preview URL and order id from PostGrid create-postcard JSON.
 * Handles top-level, nested `postcard`, alternate key names, and scored URL fallbacks.
 * @param {object | null | undefined} data
 * @returns {{ pdfUrl: string, orderId: string }}
 */
function extractPostgridPostcardMeta(data) {
  const empty = { pdfUrl: '', orderId: '' };
  if (!data || typeof data !== 'object') return empty;

  const tryUrl = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim() : '');

  const directKeys = ['url', 'pdf_url', 'pdfUrl', 'pdfURL', 'previewUrl', 'preview_url', 'finalPdfUrl', 'pdfLink'];
  for (const key of directKeys) {
    const u = tryUrl(/** @type {any} */ (data)[key]);
    if (u) return { pdfUrl: u, orderId: extractOrderIdFromPostgridBody(data) };
  }

  const nested = /** @type {any} */ (data).postcard;
  if (nested && typeof nested === 'object') {
    for (const key of directKeys) {
      const u = tryUrl(nested[key]);
      if (u) return { pdfUrl: u, orderId: extractOrderIdFromPostgridBody(data) };
    }
  }

  const innerData = /** @type {any} */ (data).data;
  if (innerData && typeof innerData === 'object') {
    const inner = extractPostgridPostcardMeta(innerData);
    if (inner.pdfUrl) return { pdfUrl: inner.pdfUrl, orderId: inner.orderId || extractOrderIdFromPostgridBody(data) };
  }

  const resultWrap = /** @type {any} */ (data).result;
  if (resultWrap && typeof resultWrap === 'object') {
    for (const key of directKeys) {
      const u = tryUrl(resultWrap[key]);
      if (u) return { pdfUrl: u, orderId: extractOrderIdFromPostgridBody(data) };
    }
  }

  const postcardsArr = /** @type {any} */ (data).postcards;
  if (Array.isArray(postcardsArr) && postcardsArr[0] && typeof postcardsArr[0] === 'object') {
    const first = postcardsArr[0];
    for (const key of directKeys) {
      const u = tryUrl(first[key]);
      if (u) return { pdfUrl: u, orderId: extractOrderIdFromPostgridBody(first) || extractOrderIdFromPostgridBody(data) };
    }
  }

  const candidates = collectHttpsUrlStrings(data, '', 0, []);
  if (candidates.length) {
    candidates.sort(
      (a, b) => scorePdfUrlCandidate(b.path, b.value) - scorePdfUrlCandidate(a.path, a.value),
    );
    const best = candidates[0];
    if (best && scorePdfUrlCandidate(best.path, best.value) >= 0) {
      return { pdfUrl: best.value, orderId: extractOrderIdFromPostgridBody(data) };
    }
  }

  return { pdfUrl: '', orderId: extractOrderIdFromPostgridBody(data) };
}

/**
 * @param {object} data
 * @returns {string}
 */
function extractOrderIdFromPostgridBody(data) {
  if (!data || typeof data !== 'object') return '';
  const tryId = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  let id = tryId(/** @type {any} */ (data).id);
  if (id) return id;
  id = tryId(/** @type {any} */ (data).order_id);
  if (id) return id;
  id = tryId(/** @type {any} */ (data).orderId);
  if (id) return id;
  const pc = /** @type {any} */ (data).postcard;
  if (pc && typeof pc === 'object') {
    id = tryId(pc.id);
    if (id) return id;
  }
  const inner = /** @type {any} */ (data).data;
  if (inner && typeof inner === 'object') {
    id = extractOrderIdFromPostgridBody(inner);
    if (id) return id;
  }
  const resultWrap = /** @type {any} */ (data).result;
  if (resultWrap && typeof resultWrap === 'object') {
    id = tryId(resultWrap.id);
    if (id) return id;
  }
  return '';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function permitPostalCode(permit) {
  const p = permit && typeof permit === 'object' ? permit : {};
  const z =
    (p.resolvedPostalOrZip && String(p.resolvedPostalOrZip).trim()) ||
    (p.postalcode && String(p.postalcode).trim()) ||
    (p.postalzip && String(p.postalzip).trim()) ||
    (p.zip && String(p.zip).trim()) ||
    '';
  return z;
}

/**
 * Format stored postal for display (Canadian: A1A 1A1 when possible).
 * @param {string} raw
 * @returns {string}
 */
function formatPostalForDisplay(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const t = raw.trim();
  if (!t) return '';
  const compact = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = compact.match(/^([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])(\d[ABCEGHJ-NPRSTV-Z]\d)$/);
  if (m) return `${m[1]} ${m[2]}`;
  return t.toUpperCase();
}

function contractorDisplayName(permit) {
  const p = permit && typeof permit === 'object' ? permit : {};
  const raw = (p.contractorname && String(p.contractorname).trim()) || 'Contractor';
  return raw;
}

function addressLineOne(permit) {
  const p = permit && typeof permit === 'object' ? permit : {};
  const addrRaw =
    (p.originaladdress && String(p.originaladdress).trim()) ||
    (p.address && String(p.address).trim()) ||
    '';
  return addrRaw.split(/\n/)[0].trim();
}

/**
 * Celebration headline for postcard front (side 1).
 * @param {object} permit
 */
function congratulationsHeadline(permit) {
  const p = permit && typeof permit === 'object' ? permit : {};
  const classBlob = [
    p.permitclassgroup,
    p.permitclass,
    p.permittypemapped,
    p.permittype,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/\bgarage\b/.test(classBlob)) {
    return 'Congratulations on your new garage!';
  }
  const wc = [
    p.workclassgroup,
    p.workclass,
    p.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/\bdemo/i.test(wc)) return 'Congratulations on your new project!';
  if (/\baddition/i.test(wc)) return 'Congratulations on your addition!';
  if (/\bimprove|\bexisting|\brenov|\brepair/i.test(wc)) {
    return 'Congratulations on your renovation!';
  }
  if (/\bnew\b/i.test(wc) && !/\brenew/i.test(wc)) {
    return 'Congratulations on your new build!';
  }
  return 'Congratulations on your new project!';
}

/**
 * Postcard front HTML — celebration side (full bleed white, script headline).
 * @param {object} permit
 */
function buildPostcardFrontHtml(permit) {
  const headline = escapeHtml(congratulationsHeadline(permit));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
@import url('https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap');
html, body { margin: 0; height: 100%; }
body {
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.inner { text-align: center; padding: 28px 20px; max-width: 92%; }
.headline {
  font-family: 'Great Vibes', cursive;
  font-size: 48px;
  color: #1a1a1a;
  line-height: 1.2;
}
.tagline {
  margin-top: 28px;
  font-size: 16px;
  color: #6b6a64;
}
</style>
</head>
<body>
  <div class="inner">
    <div class="headline">${headline}</div>
    <div class="tagline">From all of us at AI Brain Coach</div>
  </div>
</body>
</html>`;
}

/**
 * Postcard back HTML — message + address columns.
 * @param {object} permit
 * @param {string} copy Plain text from generateCopy (full text, no truncation here)
 */
function buildPostcardBackHtml(permit, copy) {
  const safeCopy = escapeHtml(copy || '').replace(/\r\n/g, '\n');
  const name = escapeHtml(contractorDisplayName(permit));
  const line1 = escapeHtml(addressLineOne(permit));
  const postalRaw = permitPostalCode(permit);
  const postal = formatPostalForDisplay(postalRaw);
  const cityLine = postal
    ? `Calgary, AB ${escapeHtml(postal)}`
    : `Calgary, AB ${DISPLAY_POSTAL_FALLBACK}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  html, body { margin: 0; height: 100%; background: #fff; color: #1a1a1a; }
  .wrap {
    display: flex;
    min-height: 100%;
    box-sizing: border-box;
  }
  .left {
    flex: 1;
    min-width: 0;
    padding: 14px 12px 14px 14px;
    border-right: 1px solid #e5e2dc;
    display: flex;
    flex-direction: column;
  }
  .brand {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: #2c3e7b;
    text-transform: uppercase;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  .url {
    font-size: 11px;
    color: #9a9890;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    margin-top: 4px;
  }
  .copy {
    margin-top: 12px;
    font-size: 13px;
    line-height: 1.7;
    font-family: Georgia, 'Times New Roman', serif;
    white-space: pre-wrap;
    flex: 1;
    min-height: 0;
  }
  .foot {
    font-size: 10px;
    color: #9a9890;
    margin-top: 12px;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  .right {
    width: 44%;
    min-width: 120px;
    padding: 14px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .stamp-slot {
    align-self: flex-end;
    width: 76px;
    height: 92px;
    border: 1px dashed #d6d2c8;
    font-size: 8px;
    color: #9a9890;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    line-height: 1.25;
    font-family: system-ui, sans-serif;
  }
  .addr {
    margin-top: auto;
    align-self: flex-end;
    text-align: right;
    font-family: ui-monospace, 'Cascadia Code', 'JetBrains Mono', monospace;
    font-size: 12px;
    color: #1a1a1a;
    line-height: 1.45;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="left">
      <div class="brand">AI Brain Coach</div>
      <div class="url">aibrain.coach</div>
      <div class="copy">${safeCopy}</div>
      <div class="foot">Sent via Calgary Permit Mailer</div>
    </div>
    <div class="right">
      <div class="stamp-slot">Canada Post<br/>stamp area</div>
      <div class="addr">${name}<br/>${line1}<br/>${cityLine}<br/>Canada</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Build PostGrid recipient `to` from fields on the permit.
 * Uses `resolvedPostalOrZip` (e.g. from geocoder) or permit postal fields when present.
 * Returns null if there is no site address on the record (no fallbacks).
 * Always sets city Calgary, province AB, country CA; postal only when known.
 *
 * @param {object} permit
 * @returns {{ firstName: string, lastName: string, addressLine1: string, city: string, provinceOrState: string, countryCode: string, postalOrZip?: string } | null}
 */
function recipientFromPermit(permit) {
  const p = permit && typeof permit === 'object' ? permit : {};
  const rawName = (p.contractorname && String(p.contractorname).trim()) || 'Contractor';
  const parts = rawName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Contractor';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '.';

  const addressLine1 = addressLineOne(p);
  if (!addressLine1) return null;

  const postalRaw = permitPostalCode(p);
  const postalOrZip = (formatPostalForDisplay(postalRaw) || String(postalRaw || '').trim()).trim();

  const out = {
    firstName,
    lastName,
    addressLine1,
    city: 'Calgary',
    provinceOrState: 'AB',
    countryCode: 'CA',
  };
  if (postalOrZip) out.postalOrZip = postalOrZip;
  return out;
}

/**
 * Create and send a postcard via PostGrid Print & Mail API.
 *
 * @param {object} body PostGrid postcard create body (to, frontHTML or frontTemplate, etc.)
 * @returns {Promise<object>} Parsed JSON response
 */
async function sendPostcard(body) {
  const key = process.env.POSTGRID_API_KEY;
  if (!key || key === 'your_test_key_here') {
    throw new Error('Set POSTGRID_API_KEY in .env');
  }

  const url = `${DEFAULT_BASE.replace(/\/$/, '')}/postcards`;
  const res = await axios.post(url, body, {
    timeout: 60_000,
    headers: {
      'x-api-key': key,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  });
  const { data, status } = res;

  if (status >= 400) {
    const msg = data?.message || data?.error?.message || JSON.stringify(data);
    throw new Error(`PostGrid HTTP ${status}: ${msg}`);
  }

  if (data?.object === 'error' || (typeof data?.statusCode === 'number' && data.statusCode >= 400)) {
    const msg = data?.message || data?.error?.message || JSON.stringify(data);
    throw new Error(`PostGrid error: ${msg}`);
  }

  try {
    console.log('[PostGrid raw response]', JSON.stringify(data, null, 2));
  } catch {
    console.log('[PostGrid raw response]', util.inspect(data, { depth: 12, colors: false }));
  }

  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET /postcards/{id} and return PDF `url` when ready (no delay).
 * @param {string} postcardId
 * @returns {Promise<string|null>}
 */
async function getPostcardPdfUrl(postcardId) {
  const id = typeof postcardId === 'string' ? postcardId.trim() : '';
  if (!id) return null;

  const key = process.env.POSTGRID_API_KEY;
  if (!key || key === 'your_test_key_here') return null;

  const getUrl = `${DEFAULT_BASE.replace(/\/$/, '')}/postcards/${encodeURIComponent(id)}`;
  try {
    const res = await axios.get(getUrl, {
      timeout: 60_000,
      headers: {
        'x-api-key': key,
        Accept: 'application/json',
      },
      validateStatus: () => true,
    });
    const { data, status } = res;
    if (status >= 400 || !data || typeof data !== 'object') return null;
    const u = data.url;
    if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) return u.trim();
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch PDF preview URL after postcard creation (POST often omits `url` until rendered).
 * @param {string} postcardId PostGrid postcard id from create response (e.g. postcard_…)
 * @returns {Promise<string|null>} `url` from GET /postcards/{id}, or null on any failure
 */
async function fetchPostcardPdf(postcardId) {
  const id = typeof postcardId === 'string' ? postcardId.trim() : '';
  if (!id) return null;

  const key = process.env.POSTGRID_API_KEY;
  if (!key || key === 'your_test_key_here') return null;

  try {
    await sleep(1500);
  } catch {
    return null;
  }

  return getPostcardPdfUrl(id);
}

module.exports = {
  sendPostcard,
  fetchPostcardPdf,
  getPostcardPdfUrl,
  extractPostgridPostcardMeta,
  DEFAULT_BASE,
  recipientFromPermit,
  addressLineOne,
  SENDER_BRAND_FIRST_NAME,
  SENDER_BRAND_LAST_NAME,
  buildPostcardFrontHtml,
  buildPostcardBackHtml,
};
