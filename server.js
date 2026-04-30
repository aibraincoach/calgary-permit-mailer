require('dotenv').config();

const express = require('express');
const path = require('path');
const { fetchPermits } = require('./fetchPermits');
const { runPipeline, recipientFromEnv } = require('./pipeline');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const PERMITS_DEFAULT_LIMIT = 25;
const PERMITS_DEFAULT_DAYS = 14;

app.use(express.json({ limit: '2mb' }));

app.get('/permits', async (_req, res) => {
  try {
    const permits = await fetchPermits({
      limit: PERMITS_DEFAULT_LIMIT,
      daysBack: PERMITS_DEFAULT_DAYS,
    });
    res.json(permits);
  } catch (err) {
    console.error('GET /permits error:', err);
    res.status(500).json({
      error: 'Failed to fetch permits from Calgary Open Data',
      detail: err.message || String(err),
    });
  }
});

app.post('/run', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const send = Boolean(body.send);
  const permits = body.permits;

  if (!Array.isArray(permits) || permits.length === 0) {
    res.status(400).json({
      error: 'Request body must include a non-empty "permits" array of permit objects.',
    });
    return;
  }

  if (!permits.every((p) => p && typeof p === 'object')) {
    res.status(400).json({ error: 'Each item in "permits" must be an object.' });
    return;
  }

  if (send && !recipientFromEnv()) {
    res.status(400).json({
      error:
        'send is true but PostGrid recipient env vars are missing (POSTGRID_TO_ADDRESS_LINE1, POSTGRID_TO_POSTAL_OR_ZIP).',
    });
    return;
  }

  try {
    const results = await runPipeline({ permits, send });
    res.json(results);
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes('POSTGRID_TO_')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('/run error:', err);
    res.status(500).json({ error: 'Pipeline failed', detail: msg });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.error(`Calgary Permit Mailer http://localhost:${PORT}`);
});
