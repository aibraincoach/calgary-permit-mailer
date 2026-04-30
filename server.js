require('dotenv').config();

const express = require('express');
const path = require('path');
const { fetchPermits } = require('./fetchPermits');
const { runPipeline } = require('./pipeline');
const { getPostcardPdfUrl } = require('./sendPostcard');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const PERMITS_DEFAULT_LIMIT = 50;
const PERMITS_DEFAULT_DAYS = 14;
const PERMITS_MAX_LIMIT = 10000;

app.use(express.json({ limit: '2mb' }));

app.get('/permits', async (req, res) => {
  try {
    let limit = PERMITS_DEFAULT_LIMIT;
    const raw = req.query && req.query.limit;
    if (raw != null && String(raw).trim() !== '') {
      const s = String(raw).trim().toLowerCase();
      if (s === 'all') {
        limit = PERMITS_MAX_LIMIT;
      } else {
        const n = parseInt(s, 10);
        if (Number.isFinite(n) && n > 0) {
          limit = Math.min(n, PERMITS_MAX_LIMIT);
        }
      }
    }
    const permits = await fetchPermits({
      limit,
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

  try {
    const results = await runPipeline({ permits, send });
    console.log('[server] results being sent:', JSON.stringify(results));
    res.json(results);
  } catch (err) {
    const msg = err.message || String(err);
    console.error('/run error:', err);
    res.status(500).json({ error: 'Pipeline failed', detail: msg });
  }
});

app.get('/api/postcard-preview', async (req, res) => {
  try {
    const raw = req.query && req.query.id;
    if (!raw || typeof raw !== 'string' || !String(raw).trim()) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }
    const id = String(raw).trim();
    const url = await getPostcardPdfUrl(id);
    if (!url) {
      res.status(404).json({ error: 'Preview not available' });
      return;
    }
    res.json({ id, url });
  } catch (err) {
    console.error('GET /api/postcard-preview error:', err);
    res.status(500).json({ error: 'Failed to load preview' });
  }
});

app.get('/previews', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'previews.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.error(`Calgary Permit Mailer http://localhost:${PORT}`);
});
