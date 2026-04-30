const axios = require('axios');

const DEFAULT_BASE =
  process.env.POSTGRID_API_BASE || 'https://api.postgrid.com/print-mail/v1';

/** Default PostGrid `from` name when POSTGRID_FROM_FIRST_NAME is unset. */
const SENDER_BRAND_FIRST_NAME = 'AI Brain Coach';
const SENDER_BRAND_LAST_NAME = '';

const DISPLAY_POSTAL_FALLBACK = 'T2H 0A1';

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
    (p.postalcode && String(p.postalcode).trim()) ||
    (p.postalzip && String(p.postalzip).trim()) ||
    (p.zip && String(p.zip).trim()) ||
    '';
  return z;
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
  const postal = permitPostalCode(permit);
  const cityLine = postal
    ? `Calgary, Alberta ${escapeHtml(postal)}`
    : `Calgary, Alberta ${DISPLAY_POSTAL_FALLBACK}`;

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
 * Build PostGrid recipient `to` from fields on the permit only.
 * Returns null if there is no site address on the record (no fallbacks).
 * Always sets city Calgary, province AB, country CA; postal only if present on permit.
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

  const postalOrZip = permitPostalCode(p);

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

  return data;
}

module.exports = {
  sendPostcard,
  DEFAULT_BASE,
  recipientFromPermit,
  SENDER_BRAND_FIRST_NAME,
  SENDER_BRAND_LAST_NAME,
  buildPostcardFrontHtml,
  buildPostcardBackHtml,
};
