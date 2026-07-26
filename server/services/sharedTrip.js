/**
 * Shared trip pages + ICS calendar + post-book parsing.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const DATA_DIR = process.env.SKYAGENT_DATA_DIR
  || path.join(__dirname, '..', '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'shared-trips.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ trips: {} }, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch (error) {
    logger.warn('shared trip store reset:', error.message);
    return { trips: {} };
  }
}

function writeStore(store) {
  ensureStore();
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

function createSharedTrip(payload = {}) {
  const id = crypto.randomBytes(5).toString('hex');
  const store = readStore();
  const trip = {
    id,
    createdAt: new Date().toISOString(),
    title: payload.title || `${payload.brief?.origin || ''} → ${payload.brief?.destination || 'Trip'}`.trim(),
    brief: payload.brief || null,
    recommendation: payload.recommendation || null,
    cheapest: payload.cheapest || null,
    hotels: payload.hotels || null,
    cars: payload.cars || null,
    transfers: payload.transfers || null,
    tradeoffs: payload.tradeoffs || [],
    preTrip: payload.preTrip || null,
    bookingLinks: payload.recommendation?.bookingLinks || [],
    notes: payload.notes || '',
  };
  store.trips[id] = trip;
  writeStore(store);
  return trip;
}

function getSharedTrip(id) {
  return readStore().trips[id] || null;
}

function icsEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function toIcsDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // date-only
    return String(iso).replace(/-/g, '');
  }
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildTripIcs(trip) {
  const offer = trip.recommendation || {};
  const brief = trip.brief || {};
  const uid = `${trip.id}@skyagent`;
  const start = toIcsDate(offer.segments?.[0]?.departAt || `${brief.departDate}T12:00:00Z`);
  const end = toIcsDate(offer.segments?.[offer.segments?.length - 1]?.arriveAt || `${brief.departDate}T18:00:00Z`);
  const summary = icsEscape(`${brief.origin || ''} → ${brief.destination || ''}`.trim() || trip.title);
  const description = icsEscape([
    trip.title,
    offer.airlines?.join(', '),
    offer.stopsLabel,
    `Price ref: ${offer.currency || 'USD'} ${offer.price || ''}`,
    ...(trip.preTrip?.tips || []).slice(0, 4),
  ].filter(Boolean).join('\n'));

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SkyAgent//Travel//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    start?.length === 8 ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
    end?.length === 8 ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function parseBookingConfirmation(text = '') {
  const raw = String(text || '');
  const upper = raw.toUpperCase();
  const pnr = (raw.match(/\b(?:PNR|confirmation|record locator|booking ref(?:erence)?)[:\s#]*([A-Z0-9]{6})\b/i)
    || upper.match(/\b([A-Z0-9]{6})\b/))?.[1] || null;
  const flight = raw.match(/\b([A-Z]{2})\s?(\d{1,4})\b/);
  const airports = upper.match(/\b[A-Z]{3}\b/g) || [];
  const known = new Set(['JFK', 'EWR', 'LHR', 'LGW', 'CDG', 'BDA', 'ATL', 'BOS', 'MIA', 'ORD', 'LAX', 'SFO']);
  const codes = airports.filter((c) => known.has(c));
  const dates = [...raw.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  const monthDay = raw.match(/\b(Jan(?:uary)?|Feb(?:uary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})\b/i);

  const origin = codes[0] || null;
  const destination = codes[1] || codes[0] || null;
  let departDate = dates[0] || null;
  if (!departDate && monthDay) {
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const mi = months[monthDay[1].slice(0, 3).toLowerCase()];
    const day = Number(monthDay[2]);
    const year = new Date().getUTCFullYear();
    departDate = new Date(Date.UTC(year, mi, day)).toISOString().slice(0, 10);
    if (departDate < new Date().toISOString().slice(0, 10)) {
      departDate = new Date(Date.UTC(year + 1, mi, day)).toISOString().slice(0, 10);
    }
  }

  const airline = flight ? flight[1].toUpperCase() : null;
  const flightNumber = flight ? `${flight[1].toUpperCase()}${flight[2]}` : null;

  const tips = [
    pnr ? `Save confirmation ${pnr} in your wallet / notes.` : 'No PNR detected — paste the 6-character record locator if you have it.',
    'Set a calendar alert 24h before departure for online check-in.',
    'Screenshot boarding passes once check-in opens — airport Wi‑Fi fails at the wrong time.',
  ];
  if (destination === 'LHR' || destination === 'LGW') {
    tips.push('Heathrow/Gatwick: allow extra time for security with kids; download the airport map offline.');
  }
  if (airline === 'BA') tips.push('British Airways: manage booking / seats on ba.com with the booking ref + last name.');

  const pseudoTrip = {
    id: `postbook-${crypto.randomBytes(3).toString('hex')}`,
    title: `${origin || 'Trip'} → ${destination || ''}`.trim(),
    brief: { origin, destination, departDate, passengers: 1 },
    recommendation: {
      airlines: airline ? [airline] : [],
      segments: origin && destination ? [{
        origin,
        destination,
        flightNumber: flightNumber || '',
        departAt: departDate ? `${departDate}T12:00:00.000Z` : null,
        arriveAt: departDate ? `${departDate}T18:00:00.000Z` : null,
      }] : [],
      price: null,
      currency: 'USD',
      stopsLabel: 'Confirmed booking',
    },
    preTrip: {
      tips: [
        ...tips,
        'Check weather at destination the morning of travel.',
        'Airport lounges: Priority Pass / airline status can be worth it with a long layover.',
      ],
    },
  };

  return {
    parsed: {
      pnr,
      airline,
      flightNumber,
      origin,
      destination,
      departDate,
    },
    tips: pseudoTrip.preTrip.tips,
    ics: buildTripIcs(pseudoTrip),
    reminders: [
      { when: 'T-48h', text: 'Recheck flight status and seat map' },
      { when: 'T-24h', text: 'Online check-in + download boarding passes' },
      { when: 'T-4h', text: 'Leave for airport (earlier with kids / checked bags)' },
    ],
  };
}

module.exports = {
  createSharedTrip,
  getSharedTrip,
  buildTripIcs,
  parseBookingConfirmation,
};
