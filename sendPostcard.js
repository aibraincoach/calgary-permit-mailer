const axios = require('axios');

const DEFAULT_BASE =
  process.env.POSTGRID_API_BASE || 'https://api.postgrid.com/print-mail/v1';

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

module.exports = { sendPostcard, DEFAULT_BASE };
