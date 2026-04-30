const axios = require('axios');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT =
  'CalgaryPermitMailer/1.0 (+https://github.com/aibraincoach/calgary-permit-mailer)';

/** Minimum gap between Nominatim requests (ms). */
const MIN_INTERVAL_MS = 110;

let nextAllowedAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a Canadian postal code to ANA NAN (space optional for API).
 * @param {string} raw
 * @returns {string}
 */
function normalizeCanadianPostal(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = compact.match(/^([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])(\d[ABCEGHJ-NPRSTV-Z]\d)$/);
  if (!m) return '';
  return `${m[1]} ${m[2]}`;
}

/**
 * Throttle then call Nominatim for a Calgary-area street line; returns '' on any failure.
 * @param {string} addressLine1
 * @returns {Promise<string>}
 */
async function lookupCalgaryPostalCode(addressLine1) {
  const line = String(addressLine1 || '').trim();
  if (!line) return '';

  const now = Date.now();
  if (now < nextAllowedAt) await sleep(nextAllowedAt - now);

  const q = `${line}, Calgary, Alberta, Canada`;

  let data;
  try {
    const res = await axios.get(NOMINATIM_URL, {
      params: {
        q,
        format: 'json',
        addressdetails: 1,
        limit: 1,
      },
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      timeout: 12_000,
      validateStatus: () => true,
    });
    nextAllowedAt = Date.now() + MIN_INTERVAL_MS;
    if (res.status >= 400) return '';
    data = res.data;
  } catch (err) {
    nextAllowedAt = Date.now() + MIN_INTERVAL_MS;
    console.error('[geocode] Nominatim request failed:', err.message || err);
    return '';
  }

  if (!Array.isArray(data) || !data.length) return '';

  const addr = data[0].address;
  if (!addr || typeof addr !== 'object') return '';

  const rawPc =
    (typeof addr.postcode === 'string' && addr.postcode) ||
    (typeof addr.postal_code === 'string' && addr.postal_code) ||
    '';

  return normalizeCanadianPostal(rawPc);
}

module.exports = {
  lookupCalgaryPostalCode,
  normalizeCanadianPostal,
};
