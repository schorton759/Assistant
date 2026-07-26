/**
 * Saved trips + price watches.
 * File-backed store (no Mongo) so SkyAgent can remember a family trip
 * and re-check cheapest fares until the target is hit.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { generateOffers, normalizeAirport } = require('./flightCatalog');
const { searchLiveOffers } = require('./liveFares');

const DATA_DIR = process.env.SKYAGENT_DATA_DIR
  || path.join(__dirname, '..', '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'trip-watches.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ watches: [] }, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return { watches: Array.isArray(raw.watches) ? raw.watches : [] };
  } catch (error) {
    logger.warn('trip watch store corrupt, resetting:', error.message);
    return { watches: [] };
  }
}

function writeStore(store) {
  ensureStore();
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

function newId() {
  return `watch_${crypto.randomBytes(6).toString('hex')}`;
}

function summarizeTravelers(ages = []) {
  const counts = { adult: 0, child: 0, infant: 0 };
  for (const age of ages) {
    const n = Number(age);
    if (!Number.isFinite(n) || n < 2) counts.infant += 1;
    else if (n < 12) counts.child += 1;
    else counts.adult += 1;
  }
  const parts = [];
  if (counts.adult) parts.push(`${counts.adult} adult${counts.adult > 1 ? 's' : ''}`);
  if (counts.child) parts.push(`${counts.child} child${counts.child > 1 ? 'ren' : ''}`);
  if (counts.infant) parts.push(`${counts.infant} infant${counts.infant > 1 ? 's' : ''}`);
  return parts.join(', ') || '1 adult';
}

function defaultLabel(trip) {
  const route = `${trip.origin} → ${trip.destination}`;
  const when = trip.returnDate
    ? `${trip.departDate} → ${trip.returnDate}`
    : trip.departDate;
  const who = trip.ages?.length
    ? summarizeTravelers(trip.ages)
    : `${trip.passengers || 1} traveler${(trip.passengers || 1) > 1 ? 's' : ''}`;
  return `${route} · ${when} · ${who}`;
}

/**
 * Lightweight cheapest-price probe (no NVIDIA agent desk).
 */
async function probeCheapestPrice({
  origin,
  destination,
  departDate,
  returnDate = null,
  passengers = 1,
  ages = null,
  cabin = 'economy',
}) {
  const from = normalizeAirport(origin);
  const to = normalizeAirport(destination);
  if (!from || !to || !departDate) {
    const err = new Error('origin, destination, and departDate are required');
    err.status = 400;
    throw err;
  }

  const ageList = Array.isArray(ages) && ages.length
    ? ages.map(Number)
    : Array(Math.max(1, Number(passengers) || 1)).fill(30);

  const live = await searchLiveOffers({
    origin: from,
    destination: to,
    departDate,
    returnDate,
    passengers: ageList.length,
    ages: ageList,
    cabin,
  });

  let offers = live.offers || [];
  let mode = 'live';
  if (!offers.length) {
    offers = generateOffers({
      origin: from,
      destination: to,
      departDate,
      returnDate,
      passengers: ageList.length,
      ages: ageList,
      cabin,
      count: 12,
    });
    mode = 'catalog';
  }

  const sorted = [...offers].sort((a, b) => a.price - b.price);
  const cheapest = sorted[0];
  if (!cheapest) {
    const err = new Error('No fares found for this trip yet');
    err.status = 404;
    throw err;
  }

  return {
    origin: from,
    destination: to,
    departDate,
    returnDate,
    passengers: ageList.length,
    ages: ageList,
    currentPrice: cheapest.price,
    currency: cheapest.currency || 'USD',
    pricingMode: mode,
    sampleOffer: {
      id: cheapest.id,
      price: cheapest.price,
      airlines: cheapest.airlines,
      stopsLabel: cheapest.stopsLabel,
      durationLabel: cheapest.durationLabel,
      live: Boolean(cheapest.live),
      source: cheapest.source,
    },
    offerCount: offers.length,
    checkedAt: new Date().toISOString(),
  };
}

function createWatch(input = {}) {
  const origin = normalizeAirport(input.origin);
  const destination = normalizeAirport(input.destination);
  const departDate = input.departDate;
  const deviceId = String(input.deviceId || '').trim();

  if (!deviceId) {
    const err = new Error('deviceId is required');
    err.status = 400;
    throw err;
  }
  if (!origin || !destination || !departDate) {
    const err = new Error('origin, destination, and departDate are required');
    err.status = 400;
    throw err;
  }

  const ages = Array.isArray(input.ages) ? input.ages.map(Number) : [];
  const passengers = ages.length || Math.max(1, Number(input.passengers) || 1);
  const baselinePrice = Number(input.baselinePrice);
  const targetPrice = Number(input.targetPrice);
  if (!Number.isFinite(baselinePrice) || baselinePrice <= 0) {
    const err = new Error('baselinePrice is required');
    err.status = 400;
    throw err;
  }

  // Default alert: 8% below what they just saw (or explicit target)
  const resolvedTarget = Number.isFinite(targetPrice) && targetPrice > 0
    ? targetPrice
    : Math.max(1, Math.round(baselinePrice * 0.92));

  const now = new Date().toISOString();
  const watch = {
    id: newId(),
    deviceId,
    label: input.label || defaultLabel({
      origin, destination, departDate, returnDate: input.returnDate, ages, passengers,
    }),
    origin,
    destination,
    departDate,
    returnDate: input.returnDate || null,
    passengers,
    ages: ages.length ? ages : Array(passengers).fill(30),
    cabin: input.cabin || 'economy',
    query: input.query || null,
    currency: input.currency || 'USD',
    baselinePrice: Math.round(baselinePrice),
    targetPrice: Math.round(resolvedTarget),
    lastPrice: Math.round(baselinePrice),
    lowestPrice: Math.round(baselinePrice),
    status: 'watching',
    hits: [],
    createdAt: now,
    updatedAt: now,
    lastCheckedAt: now,
  };

  const store = readStore();
  // Replace duplicate route+dates+pax for same device
  store.watches = store.watches.filter((w) => !(
    w.deviceId === deviceId
    && w.origin === watch.origin
    && w.destination === watch.destination
    && w.departDate === watch.departDate
    && (w.returnDate || null) === (watch.returnDate || null)
    && w.passengers === watch.passengers
  ));
  store.watches.unshift(watch);
  writeStore(store);
  return watch;
}

function listWatches(deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return [];
  return readStore().watches
    .filter((w) => w.deviceId === id)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function getWatch(id, deviceId = null) {
  const watch = readStore().watches.find((w) => w.id === id);
  if (!watch) return null;
  if (deviceId && watch.deviceId !== deviceId) return null;
  return watch;
}

function deleteWatch(id, deviceId) {
  const store = readStore();
  const before = store.watches.length;
  store.watches = store.watches.filter(
    (w) => !(w.id === id && w.deviceId === deviceId)
  );
  if (store.watches.length === before) return false;
  writeStore(store);
  return true;
}

function updateWatchRecord(id, mutator) {
  const store = readStore();
  const idx = store.watches.findIndex((w) => w.id === id);
  if (idx < 0) return null;
  const next = mutator({ ...store.watches[idx] });
  store.watches[idx] = next;
  writeStore(store);
  return next;
}

async function checkWatch(id, deviceId = null) {
  const existing = getWatch(id, deviceId);
  if (!existing) {
    const err = new Error('Watch not found');
    err.status = 404;
    throw err;
  }

  const probe = await probeCheapestPrice(existing);
  const price = probe.currentPrice;
  const hit = price <= existing.targetPrice;
  const dropped = price < existing.lastPrice;
  const now = new Date().toISOString();

  const watch = updateWatchRecord(existing.id, (w) => {
    const hits = Array.isArray(w.hits) ? [...w.hits] : [];
    if (hit) {
      hits.unshift({ at: now, price, currency: probe.currency });
      if (hits.length > 20) hits.length = 20;
    }
    return {
      ...w,
      lastPrice: price,
      lowestPrice: Math.min(w.lowestPrice || price, price),
      currency: probe.currency || w.currency,
      status: hit ? 'hit' : (w.status === 'paused' ? 'paused' : 'watching'),
      lastCheckedAt: now,
      updatedAt: now,
      lastSample: probe.sampleOffer,
      pricingMode: probe.pricingMode,
      hits,
    };
  });

  return {
    watch,
    probe,
    alert: hit
      ? {
        type: 'price_hit',
        message: `${watch.label} is now ${probe.currency} ${price} (target ${watch.targetPrice}).`,
        savingsVsBaseline: Math.max(0, watch.baselinePrice - price),
      }
      : dropped
        ? {
          type: 'price_drop',
          message: `${watch.label} dropped to ${probe.currency} ${price}.`,
          savingsVsBaseline: Math.max(0, watch.baselinePrice - price),
        }
        : null,
  };
}

async function checkAllForDevice(deviceId) {
  const watches = listWatches(deviceId).filter((w) => w.status !== 'paused');
  const results = [];
  for (const w of watches) {
    try {
      // Sequential to avoid slamming fare APIs
      // eslint-disable-next-line no-await-in-loop
      results.push(await checkWatch(w.id, deviceId));
    } catch (error) {
      results.push({
        watch: w,
        error: error.message,
        alert: null,
      });
    }
  }
  const alerts = results.map((r) => r.alert).filter(Boolean);
  return { results, alerts, checkedAt: new Date().toISOString() };
}

module.exports = {
  createWatch,
  listWatches,
  getWatch,
  deleteWatch,
  checkWatch,
  checkAllForDevice,
  probeCheapestPrice,
  defaultLabel,
  STORE_PATH,
};
