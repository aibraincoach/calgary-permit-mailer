const axios = require('axios');

const DEFAULT_BASE =
  process.env.POSTGRID_API_BASE || 'https://api.postgrid.com/print-mail/v1';

/** Default PostGrid `from` name when POSTGRID_FROM_FIRST_NAME is unset. */
const SENDER_BRAND_FIRST_NAME = 'AI Brain Coach';
const SENDER_BRAND_LAST_NAME = '';

/**
 * Build PostGrid recipient `to` from fields on the permit only.
 * Returns null if there is no site address on the record (no fallbacks).
 *
 * @param {object} permit
 * @returns {{ firstName: string, lastName: string, addressLine1: string, city?: string, provinceOrState?: string, postalOrZip?: string, countryCode?: string } | null}
 */
function recipientFromPermit(permit) {
  const p = permit && typeof permit === 'object' ? permit : {};
  const rawName = (p.contractorname && String(p.contractorname).trim()) || 'Contractor';
  const parts = rawName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Contractor';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '.';

  const addrRaw =
    (p.originaladdress && String(p.originaladdress).trim()) ||
    (p.address && String(p.address).trim()) ||
    '';
  const addressLine1 = addrRaw.split(/\n/)[0].trim();
  if (!addressLine1) return null;

  const out = {
    firstName,
    lastName,
    addressLine1,
  };

  const city = p.city != null && String(p.city).trim() ? String(p.city).trim() : '';
  const provinceOrState =
    (p.provincestate && String(p.provincestate).trim()) ||
    (p.province && String(p.province).trim()) ||
    '';
  const postalOrZip =
    (p.postalcode && String(p.postalcode).trim()) ||
    (p.postalzip && String(p.postalzip).trim()) ||
    (p.zip && String(p.zip).trim()) ||
    '';
  const countryCode =
    (p.countrycode && String(p.countrycode).trim()) ||
    (p.country && String(p.country).trim()) ||
    '';

  if (city) out.city = city;
  if (provinceOrState) out.provinceOrState = provinceOrState;
  if (postalOrZip) out.postalOrZip = postalOrZip;
  if (countryCode) out.countryCode = countryCode;

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
};
