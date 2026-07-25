const express = require('express');
const { searchFlights } = require('../agents/flightAgents');
const { hasNvidiaKey, MODELS } = require('../services/aiService');
const { CITY_TO_AIRPORTS } = require('../services/flightCatalog');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'skyagent-flights',
    nvidiaEnabled: hasNvidiaKey(),
    models: MODELS,
  });
});

router.get('/airports', (_req, res) => {
  const airports = Object.entries(CITY_TO_AIRPORTS).map(([city, codes]) => ({
    city: city.replace(/_/g, ' '),
    codes,
  }));
  res.json({ airports });
});

router.post('/search', async (req, res) => {
  try {
    const result = await searchFlights(req.body || {});
    res.json(result);
  } catch (error) {
    logger.error('Flight search error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Flight search failed',
    });
  }
});

router.post('/ask', async (req, res) => {
  try {
    const { message, ...rest } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    const result = await searchFlights({ ...rest, query: message });
    res.json(result);
  } catch (error) {
    logger.error('Flight ask error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Flight ask failed',
    });
  }
});

module.exports = router;
