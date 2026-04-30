const { fetchPermits } = require('./fetchPermits');
const { generateCopy } = require('./generateCopy');
const { lookupCalgaryPostalCode } = require('./geocodePostal');
const {
  sendPostcard,
  recipientFromPermit,
  extractPostgridPostcardMeta,
  SENDER_BRAND_FIRST_NAME,
  SENDER_BRAND_LAST_NAME,
  buildPostcardFrontHtml,
  buildPostcardBackHtml,
  addressLineOne,
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
 * @param {{ limit?: number, days?: number, send: boolean, permits?: object[] }} opts
 * @returns {Promise<Array<{ permitnum: string, contractorname: string, address: string, copy: string, postcardStatus: string, workclassgroup?: string, pdfUrl?: string, orderId?: string }>>}
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

  /** @type {Array<{ permitnum: string, contractorname: string, address: string, copy: string, postcardStatus: string, workclassgroup?: string, pdfUrl?: string, orderId?: string }>} */
  const rows = [];

  for (const permit of permits) {
    const permitnum = permit.permitnum || '';
    const contractorname = permit.contractorname || '';
    const address = permit.address || permit.originaladdress || '';
    const workclassgroup = permit.workclassgroup || '';

    if (send && !addressLineOne(permit)) {
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

    let permitForSend = permit;
    try {
      const geo = await lookupCalgaryPostalCode(addressLineOne(permit));
      if (geo) {
        permitForSend = { ...permit, resolvedPostalOrZip: geo };
        console.log('[pipeline] Geocoded postal for', permitnum || '(unknown):', geo);
      }
    } catch (err) {
      console.error('[pipeline] Geocoder error:', err.message || err);
    }

    const mailTo = recipientFromPermit(permitForSend);
    if (!mailTo) {
      console.error('Skipped — recipient build failed', permitnum || '(unknown permit)');
      rows.push({
        permitnum,
        contractorname,
        address,
        copy,
        workclassgroup,
        postcardStatus: 'Failed',
      });
      continue;
    }

    const frontHTML = buildPostcardFrontHtml(permit);
    const backHTML = buildPostcardBackHtml(permitForSend, copy);
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
      const { pdfUrl, orderId } = extractPostgridPostcardMeta(postgridRes);
      console.log(
        '[pipeline] PostGrid extracted pdfUrl:',
        pdfUrl || '(none)',
        'orderId:',
        orderId || '(none)',
      );

      const row = {
        permitnum,
        contractorname,
        address,
        copy,
        workclassgroup,
        postcardStatus: 'Postcard Sent',
      };
      if (pdfUrl) row.pdfUrl = pdfUrl;
      if (orderId) row.orderId = orderId;
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
