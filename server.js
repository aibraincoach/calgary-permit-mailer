require('dotenv').config();

const express = require('express');
const path = require('path');
const { runPipeline, recipientFromEnv } = require('./pipeline');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '256kb' }));

app.use(express.static(path.join(__dirname, 'public')));

app.post('/run', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const limit = Number(body.limit);
  const days = Number(body.days);
  const send = Boolean(body.send);

  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    res.status(400).json({ error: 'limit must be a number between 1 and 100' });
    return;
  }
  if (!Number.isFinite(days) || days < 1 || days > 30) {
    res.status(400).json({ error: 'days must be a number between 1 and 30' });
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
    const results = await runPipeline({ limit, days, send });
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

app.listen(PORT, () => {
  console.error(`Calgary Permit Mailer http://localhost:${PORT}`);
});
