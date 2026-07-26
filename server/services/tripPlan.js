/**
 * Trip dashboard — one saved plan with flight / hotel / car / transfer status.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { normalizeAirport } = require('./flightCatalog');

const DATA_DIR = process.env.SKYAGENT_DATA_DIR
  || path.join(__dirname, '..', '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'trip-plans.json');

const STATUSES = new Set(['needed', 'selected', 'watching', 'booked', 'skipped']);
const COMPONENTS = ['flight', 'hotel', 'car', 'transfer'];

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ plans: [] }, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return { plans: Array.isArray(raw.plans) ? raw.plans : [] };
  } catch (error) {
    logger.warn('trip plan store reset:', error.message);
    return { plans: [] };
  }
}

function writeStore(store) {
  ensureStore();
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

function newId() {
  return `plan_${crypto.randomBytes(6).toString('hex')}`;
}

function emptyComponent(status = 'needed') {
  return { status, offer: null, notes: '', updatedAt: new Date().toISOString() };
}

function slimOffer(offer) {
  if (!offer) return null;
  return {
    id: offer.id,
    type: offer.type || null,
    origin: offer.origin,
    destination: offer.destination,
    departDate: offer.departDate || offer.checkIn || offer.pickupDate || null,
    returnDate: offer.returnDate || offer.checkOut || offer.dropoffDate || null,
    price: offer.price,
    currency: offer.currency || 'USD',
    airlines: offer.airlines || null,
    stopsLabel: offer.stopsLabel || null,
    durationLabel: offer.durationLabel || null,
    name: offer.name || null,
    area: offer.area || null,
    vendor: offer.vendor || null,
    category: offer.category || null,
    mode: offer.mode || null,
    bookingLinks: offer.bookingLinks || [],
  };
}

function planTitle(brief = {}) {
  const route = brief.origin && brief.destination
    ? `${brief.origin} → ${brief.destination}`
    : 'Trip plan';
  const when = brief.returnDate
    ? `${brief.departDate} → ${brief.returnDate}`
    : (brief.departDate || '');
  return [route, when].filter(Boolean).join(' · ');
}

function buildChecklist(components = {}) {
  const items = [];
  for (const key of COMPONENTS) {
    const c = components[key];
    if (!c || c.status === 'skipped') continue;
    if (c.status === 'booked') {
      items.push({ id: `${key}-booked`, label: `${key} booked`, done: true });
    } else if (c.status === 'watching') {
      items.push({ id: `${key}-watch`, label: `Watching ${key} price`, done: false });
    } else if (c.offer) {
      items.push({ id: `${key}-book`, label: `Book ${key}`, done: false });
    } else if (c.status === 'needed') {
      items.push({ id: `${key}-pick`, label: `Choose a ${key}`, done: false });
    }
  }
  return items;
}

function progress(components = {}) {
  const active = COMPONENTS.filter((k) => components[k] && components[k].status !== 'skipped');
  const done = active.filter((k) => ['booked', 'watching'].includes(components[k].status)
    || (components[k].status === 'selected' && components[k].offer));
  // booked counts as complete; selected with offer is in-progress partial
  const booked = active.filter((k) => components[k].status === 'booked');
  return {
    total: active.length,
    booked: booked.length,
    ready: done.length,
    pct: active.length ? Math.round((booked.length / active.length) * 100) : 0,
  };
}

function createPlan(input = {}) {
  const deviceId = String(input.deviceId || '').trim();
  if (!deviceId) {
    const err = new Error('deviceId is required');
    err.status = 400;
    throw err;
  }

  const brief = {
    origin: normalizeAirport(input.brief?.origin || input.origin) || null,
    destination: normalizeAirport(input.brief?.destination || input.destination) || null,
    departDate: input.brief?.departDate || input.departDate || null,
    returnDate: input.brief?.returnDate || input.returnDate || null,
    passengers: input.brief?.passengers || input.passengers || 1,
    ages: input.brief?.ages || input.ages || null,
    passengerSummary: input.brief?.passengerSummary || null,
  };

  const components = {
    flight: emptyComponent(input.components?.flight?.offer ? 'selected' : 'needed'),
    hotel: emptyComponent(
      input.includeHotel === false || input.includeHotel === undefined
        ? (input.components?.hotel?.offer ? 'selected' : 'skipped')
        : (input.components?.hotel?.offer ? 'selected' : 'needed')
    ),
    car: emptyComponent(
      input.includeCar === false || input.includeCar === undefined
        ? (input.components?.car?.offer ? 'selected' : 'skipped')
        : (input.components?.car?.offer ? 'selected' : 'needed')
    ),
    transfer: emptyComponent(
      input.includeTransfer === false || input.includeTransfer === undefined
        ? (input.components?.transfer?.offer ? 'selected' : 'skipped')
        : (input.components?.transfer?.offer ? 'selected' : 'needed')
    ),
  };

  for (const key of COMPONENTS) {
    if (input.components?.[key]) {
      components[key] = {
        ...components[key],
        ...input.components[key],
        offer: slimOffer(input.components[key].offer) || components[key].offer,
        status: STATUSES.has(input.components[key].status)
          ? input.components[key].status
          : components[key].status,
      };
    }
  }

  const now = new Date().toISOString();
  const plan = {
    id: newId(),
    deviceId,
    title: input.title || planTitle(brief),
    brief,
    components,
    checklist: buildChecklist(components),
    progress: progress(components),
    query: input.query || null,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  const store = readStore();
  // Only one active plan per device — archive previous
  store.plans = store.plans.map((p) => (
    p.deviceId === deviceId && p.active ? { ...p, active: false, updatedAt: now } : p
  ));
  store.plans.unshift(plan);
  writeStore(store);
  return plan;
}

function createPlanFromSearch(deviceId, searchResult = {}, extras = {}) {
  const flights = searchResult.flights || (searchResult.type === 'flights' ? searchResult : null);
  const hotels = searchResult.hotels || null;
  const cars = searchResult.cars || (searchResult.type === 'cars' ? searchResult : null);
  const transfers = searchResult.transfers || null;
  const brief = flights?.brief || searchResult.brief || {};

  const hasHotel = Boolean(hotels?.recommendation);
  const hasCar = Boolean(cars?.recommendation);
  const hasTransfer = Boolean(transfers?.recommendation);

  return createPlan({
    deviceId,
    brief,
    query: extras.query || null,
    includeHotel: hasHotel ? true : (extras.includeHotel === true),
    includeCar: hasCar ? true : (extras.includeCar === true),
    includeTransfer: hasTransfer ? true : (extras.includeTransfer === true),
    components: {
      flight: {
        status: flights?.recommendation ? 'selected' : 'needed',
        offer: flights?.recommendation || null,
      },
      hotel: {
        status: hasHotel ? 'selected' : 'skipped',
        offer: hotels?.recommendation || null,
      },
      car: {
        status: hasCar ? 'selected' : 'skipped',
        offer: cars?.recommendation || null,
      },
      transfer: {
        status: hasTransfer ? 'selected' : 'skipped',
        offer: transfers?.recommendation || null,
      },
    },
  });
}

function listPlans(deviceId, { activeOnly = false } = {}) {
  const id = String(deviceId || '').trim();
  if (!id) return [];
  return readStore().plans
    .filter((p) => p.deviceId === id && (!activeOnly || p.active))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function getPlan(id, deviceId = null) {
  const plan = readStore().plans.find((p) => p.id === id);
  if (!plan) return null;
  if (deviceId && plan.deviceId !== deviceId) return null;
  return plan;
}

function getActivePlan(deviceId) {
  return listPlans(deviceId, { activeOnly: true })[0] || null;
}

function updatePlan(id, deviceId, patch = {}) {
  const store = readStore();
  const idx = store.plans.findIndex((p) => p.id === id && p.deviceId === deviceId);
  if (idx < 0) {
    const err = new Error('Plan not found');
    err.status = 404;
    throw err;
  }

  const prev = store.plans[idx];
  const components = { ...prev.components };

  if (patch.components) {
    for (const key of COMPONENTS) {
      if (!patch.components[key]) continue;
      const next = { ...components[key], ...patch.components[key], updatedAt: new Date().toISOString() };
      if (patch.components[key].offer !== undefined) {
        next.offer = slimOffer(patch.components[key].offer);
      }
      if (patch.components[key].status && !STATUSES.has(patch.components[key].status)) {
        const err = new Error(`Invalid status for ${key}`);
        err.status = 400;
        throw err;
      }
      components[key] = next;
    }
  }

  // Convenience: setComponentStatus via { component, status }
  if (patch.component && patch.status) {
    const key = patch.component;
    if (!COMPONENTS.includes(key)) {
      const err = new Error('Unknown component');
      err.status = 400;
      throw err;
    }
    if (!STATUSES.has(patch.status)) {
      const err = new Error('Invalid status');
      err.status = 400;
      throw err;
    }
    components[key] = {
      ...components[key],
      status: patch.status,
      updatedAt: new Date().toISOString(),
    };
  }

  const now = new Date().toISOString();
  const plan = {
    ...prev,
    title: patch.title || prev.title,
    active: patch.active === undefined ? prev.active : Boolean(patch.active),
    brief: patch.brief ? { ...prev.brief, ...patch.brief } : prev.brief,
    components,
    checklist: buildChecklist(components),
    progress: progress(components),
    updatedAt: now,
  };

  store.plans[idx] = plan;
  writeStore(store);
  return plan;
}

function deletePlan(id, deviceId) {
  const store = readStore();
  const before = store.plans.length;
  store.plans = store.plans.filter((p) => !(p.id === id && p.deviceId === deviceId));
  if (store.plans.length === before) return false;
  writeStore(store);
  return true;
}

module.exports = {
  createPlan,
  createPlanFromSearch,
  listPlans,
  getPlan,
  getActivePlan,
  updatePlan,
  deletePlan,
  slimOffer,
  buildChecklist,
  progress,
  STATUSES,
  COMPONENTS,
};
