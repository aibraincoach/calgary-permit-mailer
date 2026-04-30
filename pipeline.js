const { fetchPermits } = require('./fetchPermits');
const { generateCopy } = require('./generateCopy');
const { sendPostcard } = require('./sendPostcard');

function recipientFromEnv() {
  const line1 = process.env.POSTGRID_TO_ADDRESS_LINE1;
  const postal = process.env.POSTGRID_TO_POSTAL_OR_ZIP;
  if (!line1 || !postal) return null;
  return {
    firstName: process.env.POSTGRID_TO_FIRST_NAME || 'Postcard',
    lastName: process.env.POSTGRID_TO_LAST_NAME || 'Test',
    addressLine1: line1,
    addressLine2: process.env.POSTGRID_TO_ADDRESS_LINE2 || undefined,
    city: process.env.POSTGRID_TO_CITY || 'Calgary',
    provinceOrState: process.env.POSTGRID_TO_PROVINCE || 'AB',
    postalOrZip: postal,
    countryCode: process.env.POSTGRID_TO_COUNTRY || 'CA',
  };
}

function senderFromEnv() {
  const line1 = process.env.POSTGRID_FROM_ADDRESS_LINE1;
  if (!line1) return undefined;
  return {
    firstName: process.env.POSTGRID_FROM_FIRST_NAME || 'Sender',
    lastName: process.env.POSTGRID_FROM_LAST_NAME || '',
    addressLine1: line1,
    addressLine2: process.env.POSTGRID_FROM_ADDRESS_LINE2 || undefined,
    city: process.env.POSTGRID_FROM_CITY,
    provinceOrState: process.env.POSTGRID_FROM_PROVINCE,
    postalOrZip: process.env.POSTGRID_FROM_POSTAL_OR_ZIP,
    countryCode: process.env.POSTGRID_FROM_COUNTRY || 'CA',
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function copyToFrontHtml(copy) {
  const safe = escapeHtml(copy);
  const body = safe
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map(
      (chunk) =>
        `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.45;">${chunk.replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;font-family:Georgia,serif;color:#222;background:#fff;">${body}</body></html>`;
}

function defaultBackHtml() {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;font-family:Arial,sans-serif;">
  <p style="font-size:12px;color:#555;">YYC ProBuild — Calgary construction supply partner.</p>
</body></html>`;
}

const MAX_PIPELINE_PERMITS = 50;

/**
 * @param {{ limit?: number, days?: number, send: boolean, permits?: object[] }} opts
 * @returns {Promise<Array<{ permitnum: string, contractorname: string, address: string, copy: string, postcardStatus: string, workclassgroup?: string }>>}
 */
async function runPipeline(opts) {
  const send = Boolean(opts.send);

  if (send && !recipientFromEnv()) {
    throw new Error(
      'Send requested but POSTGRID_TO_ADDRESS_LINE1 and POSTGRID_TO_POSTAL_OR_ZIP are not set.',
    );
  }

  let permits;
  if (Array.isArray(opts.permits) && opts.permits.length > 0) {
    permits = opts.permits.slice(0, MAX_PIPELINE_PERMITS);
  } else {
    const limit = Math.max(1, Math.min(100, Number(opts.limit) || 5));
    const days = Math.max(1, Math.min(30, Number(opts.days) || 14));
    permits = await fetchPermits({ limit, daysBack: days });
  }
  const from = senderFromEnv();
  const backHTML = defaultBackHtml();
  const size = process.env.POSTGRID_POSTCARD_SIZE || '6x4';
  const mailingClass = process.env.POSTGRID_MAILING_CLASS || 'standard_class';
  const to = send ? recipientFromEnv() : null;

  /** @type {Array<{ permitnum: string, contractorname: string, address: string, copy: string, postcardStatus: string }>} */
  const rows = [];

  for (const permit of permits) {
    const permitnum = permit.permitnum || '';
    const contractorname = permit.contractorname || '';
    const address = permit.address || permit.originaladdress || '';
    const workclassgroup = permit.workclassgroup || '';

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

    const frontHTML = copyToFrontHtml(copy);
    const payload = {
      to,
      ...(from ? { from } : {}),
      frontHTML,
      backHTML,
      size,
      mailingClass,
      description: `Permit ${permitnum || 'unknown'}`,
    };

    try {
      await sendPostcard(payload);
      rows.push({
        permitnum,
        contractorname,
        address,
        copy,
        workclassgroup,
        postcardStatus: 'Postcard Sent',
      });
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
  recipientFromEnv,
};
