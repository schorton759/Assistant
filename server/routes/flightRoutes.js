const express = require('express');
const { searchFlights } = require('../agents/flightAgents');
const { searchCars, wantsCars, wantsFlights } = require('../agents/carAgents');
const {
  wantsHotels,
  wantsTransfers,
  wantsWholeTrip,
  searchHotels,
  searchTransfers,
} = require('../agents/tripExtras');
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
const {
  createSharedTrip,
  getSharedTrip,
  buildTripIcs,
  parseBookingConfirmation,
} = require('../services/sharedTrip');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'skyagent-flights',
    nvidiaEnabled: hasNvidiaKey(),
    models: MODELS,
    features: [
      'flights', 'cars', 'hotels', 'transfers', 'booking-links',
      'live-fares', 'trip-watches', 'shared-trips', 'post-book', 'pre-trip-ops',
    ],
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
  const whole = body.forceWholeTrip || wantsWholeTrip(message);
  const includeFlights = body.forceFlights || wantsFlights(message) || whole;
  const includeCars = body.forceCars || wantsCars(message) || whole;
  const includeHotels = body.forceHotels || wantsHotels(message) || whole;
  const includeTransfers = body.forceTransfers || wantsTransfers(message) || whole;

  if (includeCars && !includeFlights && !includeHotels && !includeTransfers) {
    return searchCars(body);
  }
  if (includeHotels && !includeFlights && !includeCars && !includeTransfers) {
    return searchHotels(body);
  }
  if (includeTransfers && !includeFlights && !includeCars && !includeHotels) {
    return searchTransfers(body);
  }

  const flights = includeFlights ? await searchFlights(body) : null;

  // Preserve clarification flow for family size/ages
  if (flights?.status === 'needs_clarification') {
    return flights;
  }

  const brief = flights?.brief || {
    origin: body.origin,
    destination: body.destination || body.location,
    departDate: body.departDate,
    returnDate: body.returnDate,
    passengers: body.passengers,
    ages: body.ages,
  };

  const extras = {};
  if (includeCars) {
    extras.cars = await searchCars({
      ...body,
      location: body.location || brief.destination,
      pickupDate: body.pickupDate || brief.departDate,
      dropoffDate: body.dropoffDate || brief.returnDate,
      destination: brief.destination,
      departDate: brief.departDate,
      returnDate: brief.returnDate,
      passengers: brief.passengers,
    });
  }
  if (includeHotels) {
    extras.hotels = await searchHotels({
      ...body,
      location: brief.destination,
      destination: brief.destination,
      departDate: brief.departDate,
      returnDate: brief.returnDate,
      passengers: brief.passengers,
      ages: brief.ages,
    });
  }
  if (includeTransfers) {
    extras.transfers = await searchTransfers({
      ...body,
      location: brief.destination,
      destination: brief.destination,
      departDate: brief.departDate,
      passengers: brief.passengers,
    });
  }

  const extraKeys = Object.keys(extras);
  if (!flights && extraKeys.length === 1) return extras[extraKeys[0]];
  if (!extraKeys.length) return flights;

  return {
    status: 'ok',
    type: 'travel',
    flights,
    ...extras,
    brief,
    tradeoffs: flights?.tradeoffs || [],
    preTrip: flights?.preTrip || null,
    nvidiaEnabled: hasNvidiaKey(),
    generatedAt: new Date().toISOString(),
  };
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

router.post('/hotels/search', async (req, res) => {
  try {
    res.json(await searchHotels(req.body || {}));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Hotel search failed' });
  }
});

router.post('/transfers/search', async (req, res) => {
  try {
    res.json(await searchTransfers(req.body || {}));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Transfer search failed' });
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

/** Shareable trip page */
router.post('/share', (req, res) => {
  try {
    const trip = createSharedTrip(req.body || {});
    res.status(201).json({
      trip,
      url: `/skyagent/trip/${trip.id}`,
      icsUrl: `/api/flights/share/${trip.id}.ics`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Share failed' });
  }
});

router.get('/share/:id', (req, res) => {
  const id = String(req.params.id || '').replace(/\.ics$/i, '');
  const trip = getSharedTrip(id);
  if (!trip) return res.status(404).json({ error: 'Shared trip not found' });
  if (/\.ics$/i.test(req.params.id) || req.query.format === 'ics') {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="skyagent-${id}.ics"`);
    return res.send(buildTripIcs(trip));
  }
  res.json({ trip });
});

router.get('/share/:id.ics', (req, res) => {
  const trip = getSharedTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Shared trip not found' });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="skyagent-${req.params.id}.ics"`);
  res.send(buildTripIcs(trip));
});

/** Post-book assistant — paste a confirmation */
router.post('/postbook', (req, res) => {
  const text = req.body?.text || req.body?.confirmation || '';
  if (!String(text).trim()) {
    return res.status(400).json({ error: 'Paste a booking confirmation' });
  }
  res.json(parseBookingConfirmation(text));
});

module.exports = router;
