const axios = require('axios');

const DEFAULT_DATASET =
  process.env.CALGARY_PERMITS_DATASET_URL ||
  'https://data.calgary.ca/resource/c2es-76ed.json';

/**
 * @typedef {Object} CalgaryBuildingPermit
 * @property {string} [permitnum]
 * @property {string} [statuscurrent]
 * @property {string} [applieddate]
 * @property {string} [issueddate]
 * @property {string} [permittype]
 * @property {string} [permitclass]
 * @property {string} [description]
 * @property {string} [applicantname]
 * @property {string} [contractorname]
 * @property {string} [originaladdress]
 * @property {string} [communityname]
 * @property {string} [latitude]
 * @property {string} [longitude]
 */

/**
 * Fetch building permits from Calgary Open Data (Socrata).
 *
 * @param {object} [opts]
 * @param {string} [opts.baseUrl] Full resource URL (without query)
 * @param {number} [opts.limit=100] $limit
 * @param {number} [opts.daysBack] If set, adds $where issueddate >= ...
 * @param {string} [opts.where] Raw SoQL $where (overrides daysBack)
 * @param {string} [opts.order] SoQL $order, default issueddate DESC
 * @returns {Promise<CalgaryBuildingPermit[]>} Full JSON objects from Socrata (no $select projection — every column the API returns per row).
 */
async function fetchPermits(opts = {}) {
  const baseUrl = opts.baseUrl || DEFAULT_DATASET;
  const limit = opts.limit ?? 100;
  const order = opts.order || 'issueddate DESC';

  const params = new URLSearchParams();
  params.set('$limit', String(limit));
  params.set('$order', order);

  if (opts.where) {
    params.set('$where', opts.where);
  } else if (opts.daysBack != null && opts.daysBack > 0) {
    const since = new Date();
    since.setDate(since.getDate() - opts.daysBack);
    const iso = since.toISOString().slice(0, 10);
    params.set('$where', `issueddate >= '${iso}T00:00:00.000'`);
  }

  const url = `${baseUrl}?${params.toString()}`;
  const { data } = await axios.get(url, {
    timeout: 60_000,
    headers: { Accept: 'application/json' },
  });

  if (!Array.isArray(data)) {
    throw new Error(
      `Expected JSON array from Calgary Open Data, got ${typeof data}`,
    );
  }
  return data;
}

module.exports = { fetchPermits, DEFAULT_DATASET };
