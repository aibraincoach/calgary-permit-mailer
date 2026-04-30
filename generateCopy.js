const OpenAI = require('openai');

const MODEL = 'gpt-4o-mini';

/**
 * Map permit work signals to a vague phrase (never echo description verbatim).
 * @param {object} permit
 */
function vagueWorkPhrase(permit) {
  const blob = [
    permit.workclassgroup,
    permit.workclass,
    permit.permittypemapped,
    permit.permittype,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/\bdemo/i.test(blob)) return 'a demolition';
  if (/\baddition/i.test(blob)) return 'an addition';
  if (/\bimprove|\bexisting|\brenov|\brepair/i.test(blob)) return 'a renovation';
  if (/\bnew\b/i.test(blob) && !/\brenew/i.test(blob)) return 'a new build';
  return 'your project';
}

/**
 * @param {object} permit Calgary Open Data building permit row (or shaped input)
 * @param {string} [permit.contractorname]
 * @param {string} [permit.communityname]
 * @param {string} [permit.workclassgroup]
 * @returns {Promise<string|null>} Plain postcard copy, or null on failure
 */
async function generateCopy(permit) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error('generateCopy: OPENAI_API_KEY not set; skipping permit.');
    return null;
  }

  const contractor = (permit.contractorname && String(permit.contractorname).trim()) || '';
  const neighbourhood = (permit.communityname && String(permit.communityname).trim()) || '';
  const workVague = vagueWorkPhrase(permit);

  const hints = {
    contractorNameOrEmpty: contractor,
    neighbourhoodOrEmpty: neighbourhood,
    workVaguePhrase: workVague,
  };

  const userContent = `Write the full text for a small postcard (sender brand: AI Brain Coach, Calgary area).

Context for you only (do NOT paste field names, JSON, permit IDs, costs, or street addresses into the postcard):
${JSON.stringify(hints, null, 2)}

Rules for the postcard text itself:
- Sound like a neighbour left a friendly note, not a company that mined a database.
- NEVER include a permit number, file number, or reference number.
- NEVER include dollar amounts, estimates, budgets, or the word "cost".
- NEVER say or imply you "know" their job from records, open data, permits, filings, or surveillance.
- NEVER quote the project's written description; stay vague on scope (use the suggested work vibe only: new build, renovation, addition, demolition, or "your project").
- Opening: if a contractor/company name is provided in the hints, greet them naturally (e.g. "Hi Porch Lamp Fine Homes,"). If the name is empty, start with exactly: Hi there,
- Optionally weave in the neighbourhood name in a casual way if it is non-empty (e.g. "in Brentwood?"). If neighbourhood is empty, skip location names entirely.
- One short line that naturally mentions AI Brain Coach as a Calgary-area resource for contractors (plain words, no jargon).
- End with this exact sentence as its own closing line: Call AI Brain Coach for a free consultation.
- At most 6 sentences total (including the greeting and the closing line).
- Under 400 characters total, including spaces and punctuation. Plain text only — no markdown, no bullets, no labels like "Line 1:".

Good tone example (length and vibe only; do not copy verbatim):
"Hi Porch Lamp Fine Homes, working on a new build in Brentwood? AI Brain Coach helps contractors across Calgary with practical support. We'd love to hear what you need. Call AI Brain Coach for a free consultation."

Bad (never do this): mentioning permit numbers, dollar figures, full street addresses, or "we know about your project."`;

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You write very short, warm postcard blurbs for AI Brain Coach in Calgary. You refuse to sound creepy, data-driven, or surveillance-like. You follow the user rules exactly and output only the postcard body text.',
        },
        { role: 'user', content: userContent },
      ],
      max_tokens: 320,
      temperature: 0.65,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      console.error('generateCopy: empty model response; skipping permit.');
      return null;
    }
    return text;
  } catch (err) {
    console.error(
      'generateCopy: OpenAI request failed:',
      err.message || err,
    );
    return null;
  }
}

module.exports = { generateCopy, MODEL };
