const express = require('express');
const { searchFlights } = require('../agents/flightAgents');
const { searchCars, wantsCars, wantsFlights } = require('../agents/carAgents');
const { hasNvidiaKey, MODELS } = require('../services/aiService');
const { CITY_TO_AIRPORTS } = require('../services/flightCatalog');
const {
  createWatch,
  listWatches,
  deleteWatch,
  checkWatch,
  checkAllForDevice,
  probeCheapestPrice,
} = require('../services/tripWatch');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'skyagent-flights',
    nvidiaEnabled: hasNvidiaKey(),
    models: MODELS,
    features: ['flights', 'cars', 'booking-links', 'live-fares', 'trip-watches'],
  });
});

router.get('/airports', (_req, res) => {
  const airports = Object.entries(CITY_TO_AIRPORTS).map(([city, codes]) => ({
    city: city.replace(/_/g, ' '),
    codes,
  }));
  res.json({ airports });
});

async function runTravelSearch(body = {}) {
  const message = body.query || body.message || '';
  const includeFlights = body.forceFlights || wantsFlights(message);
  const includeCars = body.forceCars || wantsCars(message);

  if (includeCars && !includeFlights) {
    return searchCars(body);
  }

  const flights = await searchFlights(body);

  // Preserve clarification flow for family size/ages
  if (flights.status === 'needs_clarification') {
    return flights;
  }

  if (includeCars) {
    const cars = await searchCars({
      ...body,
      // Default car pickup at flight destination / depart date
      location: body.location || flights.brief?.destination,
      pickupDate: body.pickupDate || flights.brief?.departDate,
      dropoffDate: body.dropoffDate || flights.brief?.returnDate,
      destination: flights.brief?.destination,
      departDate: flights.brief?.departDate,
      returnDate: flights.brief?.returnDate,
    });
    return {
      status: 'ok',
      type: 'travel',
      flights,
      cars,
      brief: flights.brief,
      nvidiaEnabled: hasNvidiaKey(),
      generatedAt: new Date().toISOString(),
    };
  }

  return flights;
}

router.post('/search', async (req, res) => {
  try {
    const result = await runTravelSearch(req.body || {});
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
    const result = await runTravelSearch({ ...rest, query: message });
    res.json(result);
  } catch (error) {
    logger.error('Flight ask error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Flight ask failed',
    });
  }
});

router.post('/cars/search', async (req, res) => {
  try {
    const result = await searchCars(req.body || {});
    res.json(result);
  } catch (error) {
    logger.error('Car search error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Car search failed',
    });
  }
});

/** Saved trips / price watches */
router.get('/trips', (req, res) => {
  const deviceId = req.query.deviceId || req.headers['x-device-id'];
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
  res.json({ watches: listWatches(deviceId) });
});

router.post('/trips', async (req, res) => {
  try {
    const body = req.body || {};
    let baselinePrice = Number(body.baselinePrice);
    let currency = body.currency || 'USD';

    // If client didn't pass a baseline, probe once now
    if (!Number.isFinite(baselinePrice) || baselinePrice <= 0) {
      const probe = await probeCheapestPrice(body);
      baselinePrice = probe.currentPrice;
      currency = probe.currency;
    }

    const watch = createWatch({
      ...body,
      deviceId: body.deviceId || req.headers['x-device-id'],
      baselinePrice,
      currency,
    });
    res.status(201).json({ watch });
  } catch (error) {
    logger.error('Create trip watch error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Could not save trip' });
  }
});

router.delete('/trips/:id', (req, res) => {
  const deviceId = req.query.deviceId || req.body?.deviceId || req.headers['x-device-id'];
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
  const ok = deleteWatch(req.params.id, deviceId);
  if (!ok) return res.status(404).json({ error: 'Watch not found' });
  res.json({ ok: true });
});

router.post('/trips/:id/check', async (req, res) => {
  try {
    const deviceId = req.body?.deviceId || req.headers['x-device-id'];
    const result = await checkWatch(req.params.id, deviceId || null);
    res.json(result);
  } catch (error) {
    logger.error('Check trip watch error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Check failed' });
  }
});

router.post('/trips/check-all', async (req, res) => {
  try {
    const deviceId = req.body?.deviceId || req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
    const result = await checkAllForDevice(deviceId);
    res.json(result);
  } catch (error) {
    logger.error('Check-all trip watches error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Check failed' });
  }
});

module.exports = router;
