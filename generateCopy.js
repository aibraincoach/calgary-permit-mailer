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

  const userContent = `Write postcard copy for this Calgary building permit (contractor outreach).

Permit fields (JSON):
${JSON.stringify(payload, null, 2)}

Requirements:
- Plain text only (no markdown, no bullets labels like "Line 1:").
- Maximum 150 words total.
- Line 1: A personalized greeting that uses the contractor name naturally (${payload.contractorname || 'the contractor'}).
- Body: Briefly reference the project type and the site address; introduce YYC ProBuild as a trusted local construction supply partner in Calgary.
- Closing CTA must be exactly: Call us for a free quote on your next project.
- Tone: professional, friendly, not salesy or spammy.`;

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You write concise direct-mail postcard copy for a Calgary construction supplier. Follow the user instructions exactly.',
        },
        { role: 'user', content: userContent },
      ],
      max_tokens: 400,
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
