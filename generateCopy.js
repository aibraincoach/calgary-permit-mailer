const OpenAI = require('openai');

const MODEL = 'gpt-4o-mini';

/**
 * @param {object} permit Calgary Open Data building permit row (or shaped input)
 * @param {string} [permit.contractorname]
 * @param {string} [permit.address] project address (falls back to originaladdress)
 * @param {string} [permit.originaladdress]
 * @param {string} [permit.workclassgroup]
 * @param {string} [permit.description]
 * @param {string|number} [permit.estprojectcost]
 * @returns {Promise<string|null>} Plain postcard copy, or null on failure
 */
async function generateCopy(permit) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error('generateCopy: OPENAI_API_KEY not set; skipping permit.');
    return null;
  }

  const address = permit.address || permit.originaladdress || '';
  const payload = {
    contractorname: permit.contractorname ?? '',
    address,
    workclassgroup: permit.workclassgroup ?? '',
    description: permit.description ?? '',
    estprojectcost: permit.estprojectcost ?? '',
  };

  const userContent = `Write postcard copy for a REAL printed postcard (Canada Post). Physical card — space is tiny.

Permit fields (JSON):
${JSON.stringify(payload, null, 2)}

STRICT LIMITS (must all be satisfied):
- Exactly 6 lines of text (use real line breaks between lines).
- Line 5 must be completely blank (empty line only).
- At most 8 words per line on lines 1–4 and line 6 (count words; wrap if needed).
- Entire message under 300 characters including spaces and line breaks.

EXACT STRUCTURE:
- Line 1: If contractor name is present and non-empty, start with: Hi [that name],
  If missing or blank, use exactly: Hi there,
- Lines 2–4: ONE short punchy sentence about THIS permit only (project type, address, or scope). Split across lines 2–4 only if needed to stay under 8 words per line. No filler.
- Line 5: (blank line — nothing on this line)
- Line 6: Exactly this text: Call YYC ProBuild for a free quote.

TONE: Direct and human, like a quick note from a neighbour. No corporate speak.

FORBIDDEN words/phrases (do not use): commitment, expertise, trusted partner, we understand, we recognize, delighted, leverage, solutions, synergy, best-in-class, proud to, at YYC ProBuild we, your partner in.

Plain text only. No "Line 1:" labels. No markdown.`;

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You write ultra-short postcard copy for YYC ProBuild (Calgary construction supply). Real mail: obey every character, line, and word limit in the user message. Output only the postcard text.',
        },
        { role: 'user', content: userContent },
      ],
      max_tokens: 220,
      temperature: 0.7,
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
