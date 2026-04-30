const { fetchPermits } = require('./fetchPermits');
const { generateCopy } = require('./generateCopy');
const {
  sendPostcard,
  recipientFromPermit,
  SENDER_BRAND_FIRST_NAME,
  SENDER_BRAND_LAST_NAME,
  buildPostcardFrontHtml,
  buildPostcardBackHtml,
} = require('./sendPostcard');

function senderFromEnv() {
  const line1 = process.env.POSTGRID_FROM_ADDRESS_LINE1;
  if (!line1) return undefined;
  return {
    firstName: process.env.POSTGRID_FROM_FIRST_NAME || SENDER_BRAND_FIRST_NAME,
    lastName: process.env.POSTGRID_FROM_LAST_NAME || SENDER_BRAND_LAST_NAME,
    addressLine1: line1,
    addressLine2: process.env.POSTGRID_FROM_ADDRESS_LINE2 || undefined,
    city: process.env.POSTGRID_FROM_CITY,
    provinceOrState: process.env.POSTGRID_FROM_PROVINCE,
    postalOrZip: process.env.POSTGRID_FROM_POSTAL_OR_ZIP,
    countryCode: process.env.POSTGRID_FROM_COUNTRY || 'CA',
  };
}

const MAX_PIPELINE_PERMITS = 50;

/**
 * PostGrid postcard create responses use top-level `url` (PDF preview); some clients use `pdf_url`.
 * @param {object | null | undefined} data
 * @returns {string}
 */
function pdfUrlFromPostgridResponse(data) {
  if (!data || typeof data !== 'object') return '';
  const top =
    (typeof data.url === 'string' && data.url.trim()) ||
    (typeof data.pdf_url === 'string' && data.pdf_url.trim()) ||
    '';
  if (top) return top;
  const pc = data.postcard;
  if (pc && typeof pc === 'object') {
    return (
      (typeof pc.url === 'string' && pc.url.trim()) ||
      (typeof pc.pdf_url === 'string' && pc.pdf_url.trim()) ||
      ''
    );
  }
  return '';
}

/**
 * Postcard order id (e.g. postcard_xxx) for support / dashboard.
 * @param {object | null | undefined} data
 * @returns {string}
 */
function postgridOrderIdFromResponse(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.id === 'string' && data.id.trim()) return data.id.trim();
  if (typeof data.order_id === 'string' && data.order_id.trim()) return data.order_id.trim();
  if (typeof data.orderId === 'string' && data.orderId.trim()) return data.orderId.trim();
  const pc = data.postcard;
  if (pc && typeof pc === 'object' && typeof pc.id === 'string' && pc.id.trim()) {
    return pc.id.trim();
  }
  return '';
}

/**
 * @param {{ limit?: number, days?: number, send: boolean, permits?: object[] }} opts
 * @returns {Promise<Array<{ permitnum: string, contractorname: string, address: string, copy: string, postcardStatus: string, workclassgroup?: string, pdfUrl?: string, postgridOrderId?: string }>>}
 */
async function runPipeline(opts) {
  const send = Boolean(opts.send);

  let permits;
  if (Array.isArray(opts.permits) && opts.permits.length > 0) {
    permits = opts.permits.slice(0, MAX_PIPELINE_PERMITS);
  } else {
    const limit = Math.max(1, Math.min(100, Number(opts.limit) || 5));
    const days = Math.max(1, Math.min(30, Number(opts.days) || 14));
    permits = await fetchPermits({ limit, daysBack: days });
  }
  const from = senderFromEnv();
  const size = process.env.POSTGRID_POSTCARD_SIZE || '6x4';
  const mailingClass = process.env.POSTGRID_MAILING_CLASS || 'standard_class';

  /** @type {Array<{ permitnum: string, contractorname: string, address: string, copy: string, postcardStatus: string, workclassgroup?: string, pdfUrl?: string, postgridOrderId?: string }>} */
  const rows = [];

  for (const permit of permits) {
    const permitnum = permit.permitnum || '';
    const contractorname = permit.contractorname || '';
    const address = permit.address || permit.originaladdress || '';
    const workclassgroup = permit.workclassgroup || '';

    const mailTo = send ? recipientFromPermit(permit) : null;

    if (send && !mailTo) {
      console.error('Skipped — no address', permitnum || '(unknown permit)');
      rows.push({
        permitnum,
        contractorname,
        address,
        copy: '',
        workclassgroup,
        postcardStatus: 'Failed',
      });
      continue;
    }

    const copy = await generateCopy(permit);
    if (!copy) {
      rows.push({
        permitnum,
        contractorname,
        address,
        copy: '',
        workclassgroup,
        postcardStatus: 'Failed',
      });
      continue;
    }

    if (!send) {
      rows.push({
        permitnum,
        contractorname,
        address,
        copy,
        workclassgroup,
        postcardStatus: 'Copy Generated',
      });
      continue;
    }

    const frontHTML = buildPostcardFrontHtml(permit);
    const backHTML = buildPostcardBackHtml(permit, copy);
    const payload = {
      to: mailTo,
      frontHTML,
      backHTML,
      size,
      mailingClass,
      description: `Permit ${permitnum || 'unknown'}`,
    };
    if (from) payload.from = from;

    try {
      const postgridRes = await sendPostcard(payload);
      const pdfUrl = pdfUrlFromPostgridResponse(postgridRes);
      const postgridOrderId = postgridOrderIdFromResponse(postgridRes);
      if (pdfUrl) console.log('PostGrid postcard PDF:', pdfUrl);
      if (postgridOrderId) console.log('PostGrid order ID:', postgridOrderId);

      const row = {
        permitnum,
        contractorname,
        address,
        copy,
        workclassgroup,
        postcardStatus: 'Postcard Sent',
      };
      if (pdfUrl) row.pdfUrl = pdfUrl;
      if (postgridOrderId) row.postgridOrderId = postgridOrderId;
      rows.push(row);
    } catch {
      rows.push({
        permitnum,
        contractorname,
        address,
        copy,
        workclassgroup,
        postcardStatus: 'Failed',
      });
    }
  }

  return rows;
}

module.exports = {
  runPipeline,
};
