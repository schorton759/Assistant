/**
 * Live market fare search.
 *
 * Primary: Travelpayouts / Aviasales Data API (cached real market prices).
 * Optional: Duffel (when DUFFEL_ACCESS_TOKEN is set).
 *
 * Catalog fallback is used only when live sources return nothing.
 * Amadeus Self-Service was decommissioned July 2026 — not used here.
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { normalizeAirport, sameMetro } = require('./flightCatalog');

// Travelpayouts docs publish this example token; replace with your affiliate token.
const DOCS_DEMO_TOKEN = '321d6a221f8926b5ec41ae89a3b2ae7b';

const AIRPORT_TO_CITY = {
  JFK: 'NYC', EWR: 'NYC', LGA: 'NYC',
  LHR: 'LON', LGW: 'LON', STN: 'LON', LTN: 'LON',
  CDG: 'PAR', ORY: 'PAR',
  NRT: 'TYO', HND: 'TYO',
  ORD: 'CHI', MDW: 'CHI',
  IAH: 'HOU', HOU: 'HOU',
  IAD: 'WAS', DCA: 'WAS', BWI: 'WAS',
  FCO: 'ROM', CIA: 'ROM',
  MXP: 'MIL', LIN: 'MIL',
  BCN: 'BCN', MAD: 'MAD', AMS: 'AMS', FRA: 'FRA', MUC: 'MUC',
  DXB: 'DXB', DOH: 'DOH', SIN: 'SIN', BKK: 'BKK', ICN: 'SEL',
  SYD: 'SYD', LAX: 'LAX', SFO: 'SFO', SEA: 'SEA', BOS: 'BOS',
  MIA: 'MIA', ATL: 'ATL', DFW: 'DFW', DEN: 'DEN', PHL: 'PHL',
  CLT: 'CLT', BDA: 'BDA', YYZ: 'YTO', YUL: 'YMQ',
};

const AIRLINE_NAMES = {
  AA: 'American Airlines', UA: 'United Airlines', DL: 'Delta Air Lines',
  BA: 'British Airways', AF: 'Air France', LH: 'Lufthansa', KL: 'KLM',
  VS: 'Virgin Atlantic', B6: 'jetBlue', AS: 'Alaska Airlines',
  EK: 'Emirates', QR: 'Qatar Airways', SQ: 'Singapore Airlines',
  TK: 'Turkish Airlines', AC: 'Air Canada', LX: 'SWISS', IB: 'Iberia',
  AY: 'Finnair', EI: 'Aer Lingus', FI: 'Icelandair', TP: 'TAP Air Portugal',
  SK: 'SAS', DY: 'Norwegian', NK: 'Spirit', F9: 'Frontier', WN: 'Southwest',
  PR: 'Philippine Airlines', Z0: 'Norse Atlantic Airways', N0: 'Norse Atlantic Airways',
};

function travelpayoutsToken() {
  return (
    process.env.TRAVELPAYOUTS_TOKEN
    || process.env.TRAVELPAYOUTS_API_TOKEN
    || DOCS_DEMO_TOKEN
  );
}

function duffelToken() {
  return process.env.DUFFEL_ACCESS_TOKEN || process.env.DUFFEL_TOKEN || '';
}

function liveFaresEnabled() {
  if (process.env.LIVE_FARES === '0' || process.env.LIVE_FARES === 'false') return false;
  // Keep unit tests offline unless explicitly opted in
  if (process.env.TEST_MODE === 'true' && process.env.LIVE_FARES !== '1') return false;
  return true;
}

function cityCode(airportOrCity) {
  const code = String(airportOrCity || '').toUpperCase();
  if (!code) return null;
  return AIRPORT_TO_CITY[code] || code;
}

function airlineName(code) {
  const c = String(code || '').toUpperCase();
  return AIRLINE_NAMES[c] || c || 'Airline';
}

function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (!h) return `${mins}m`;
  if (!mins) return `${h}h`;
  return `${h}h ${mins}m`;
}

function addMinutes(iso, minutes) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Date(d.getTime() + minutes * 60000).toISOString();
}

function fareUnits(ages = [], passengers = 1) {
  const list = Array.isArray(ages) && ages.length
    ? ages.map((a) => Number(a)).filter((a) => Number.isFinite(a))
    : Array(Math.max(1, passengers)).fill(30);
  return list.reduce((sum, age) => {
    if (age < 2) return sum + 0.1;
    if (age < 12) return sum + 0.75;
    return sum + 1;
  }, 0) || Math.max(1, passengers);
}

function passengerSummary(ages = [], passengers = 1) {
  const list = Array.isArray(ages) && ages.length
    ? ages
    : Array(Math.max(1, passengers)).fill(30);
  return list.reduce((acc, age) => {
    const t = age < 2 ? 'infant' : age < 12 ? 'child' : 'adult';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
}

function stopsLabel(stops, stopAirports = []) {
  if (!stops) return 'Nonstop';
  if (stopAirports.length) {
    return stops === 1
      ? `1 stop in ${stopAirports[0]}`
      : `${stops} stops via ${stopAirports.join(', ')}`;
  }
  return stops === 1 ? '1 stop' : `${stops} stops`;
}

function monthOf(isoDate) {
  return String(isoDate || '').slice(0, 7);
}

function offerId(parts) {
  return `live-${crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12)}`;
}

function aviasalesUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  const base = `https://www.aviasales.com${path.startsWith('/') ? path : `/${path}`}`;
  if (!marker) return base;
  const join = base.includes('?') ? '&' : '?';
  return `${base}${join}marker=${encodeURIComponent(marker)}`;
}

function normalizeMarketOffer({
  originAirport,
  destinationAirport,
  originCity,
  destinationCity,
  departAt,
  returnAt,
  airline,
  flightNumber,
  transfers,
  durationMinutes,
  adultPrice,
  currency,
  deepLink,
  gate,
  provider,
  ages,
  passengers,
  cabin,
  requestedDepartDate,
  requestedReturnDate,
}) {
  const units = fareUnits(ages, passengers);
  const price = Math.round(Number(adultPrice) * units);
  if (!Number.isFinite(price) || price <= 0) return null;

  const code = String(airline || 'XX').toUpperCase();
  const name = airlineName(code);
  const stops = Number(transfers) || 0;
  const duration = Number(durationMinutes) || 0;
  const departDate = (departAt || requestedDepartDate || '').slice(0, 10);
  const returnDate = returnAt
    ? String(returnAt).slice(0, 10)
    : (requestedReturnDate || null);

  // Prefer real airports; never leave city codes like LON/NYC as the trip endpoint
  const origin = normalizeAirport(originAirport)
    || normalizeAirport(originCity)
    || originAirport
    || originCity;
  const destination = normalizeAirport(destinationAirport)
    || normalizeAirport(destinationCity)
    || destinationAirport
    || destinationCity;

  // Reject nonsense like LHR → LON (same metro)
  if (sameMetro(origin, destination)) return null;
  const arriveAt = duration ? addMinutes(departAt || `${departDate}T12:00:00Z`, duration) : null;
  const fn = flightNumber ? `${code}${flightNumber}` : `${code}000`;

  const segments = [{
    origin,
    destination,
    airline: code,
    airlineName: name,
    flightNumber: fn,
    departAt: departAt || `${departDate}T12:00:00.000Z`,
    arriveAt: arriveAt || `${departDate}T18:00:00.000Z`,
    durationMin: duration || 180,
    durationLabel: formatDuration(duration || 180),
  }];

  return {
    id: offerId([provider, origin, destination, departDate, returnDate || '', code, fn, stops, price]),
    origin,
    destination,
    departDate,
    returnDate,
    cabin: cabin || 'economy',
    passengers: Array.isArray(ages) && ages.length ? ages.length : Math.max(1, passengers || 1),
    ages: Array.isArray(ages) && ages.length ? ages : Array(Math.max(1, passengers || 1)).fill(30),
    passengerSummary: passengerSummary(ages, passengers),
    price,
    currency: String(currency || 'USD').toUpperCase(),
    adultPrice: Math.round(Number(adultPrice)),
    stops,
    stopAirports: [],
    stopsLabel: stopsLabel(stops),
    durationMinutes: duration || 180,
    durationLabel: formatDuration(duration || 180),
    airlines: [name],
    segments,
    comfortScore: stops === 0 ? 4.2 : stops === 1 ? 3.6 : 3.1,
    baggageIncluded: false,
    refundable: false,
    source: provider,
    live: true,
    pricingNote: 'Live market fare (aggregator cache). Confirm on booking site — prices move.',
    gate: gate || null,
    deepLink: deepLink || null,
  };
}

async function tpGet(path, params = {}) {
  const token = travelpayoutsToken();
  const url = path.startsWith('http') ? path : `https://api.travelpayouts.com${path}`;
  const { data } = await axios.get(url, {
    params: { ...params, token, currency: params.currency || 'usd' },
    timeout: 12000,
    headers: { 'X-Access-Token': token },
    validateStatus: (s) => s < 500,
  });
  return data;
}

function collectPricesForDates(rows, ctx) {
  const offers = [];
  for (const row of rows || []) {
    const normalized = normalizeMarketOffer({
      originAirport: row.origin_airport,
      destinationAirport: row.destination_airport,
      originCity: row.origin,
      destinationCity: row.destination,
      departAt: row.departure_at,
      returnAt: row.return_at,
      airline: row.airline,
      flightNumber: row.flight_number,
      transfers: row.transfers,
      durationMinutes: row.duration_to || row.duration,
      adultPrice: row.price,
      currency: ctx.currency,
      deepLink: aviasalesUrl(row.link),
      gate: row.gate,
      provider: 'travelpayouts',
      ages: ctx.ages,
      passengers: ctx.passengers,
      cabin: ctx.cabin,
      requestedDepartDate: ctx.departDate,
      requestedReturnDate: ctx.returnDate,
    });
    if (normalized) offers.push(normalized);
  }
  return offers;
}

function collectCheapBuckets(data, ctx) {
  const offers = [];
  const bucket = data || {};
  for (const byTransfers of Object.values(bucket)) {
    if (!byTransfers || typeof byTransfers !== 'object') continue;
    for (const [transfers, row] of Object.entries(byTransfers)) {
      if (!row || typeof row !== 'object' || row.price == null) continue;
      const normalized = normalizeMarketOffer({
        originAirport: ctx.originAirport,
        destinationAirport: ctx.destinationAirport,
        originCity: ctx.originCity,
        destinationCity: ctx.destinationCity,
        departAt: row.departure_at,
        returnAt: row.return_at,
        airline: row.airline,
        flightNumber: row.flight_number,
        transfers: Number(transfers),
        durationMinutes: row.duration_to || row.duration,
        adultPrice: row.price,
        currency: ctx.currency,
        deepLink: null,
        gate: null,
        provider: 'travelpayouts',
        ages: ctx.ages,
        passengers: ctx.passengers,
        cabin: ctx.cabin,
        requestedDepartDate: ctx.departDate,
        requestedReturnDate: ctx.returnDate,
      });
      if (normalized) offers.push(normalized);
    }
  }
  return offers;
}

function collectCalendar(data, ctx) {
  const offers = [];
  for (const row of Object.values(data || {})) {
    if (!row || row.price == null) continue;
    // Prefer dates near the requested departure
    const dep = String(row.departure_at || '').slice(0, 10);
    if (ctx.departDate && dep && Math.abs(daysBetween(ctx.departDate, dep)) > 10) continue;
    const normalized = normalizeMarketOffer({
      originAirport: row.origin || ctx.originAirport,
      destinationAirport: row.destination || ctx.destinationAirport,
      originCity: ctx.originCity,
      destinationCity: ctx.destinationCity,
      departAt: row.departure_at,
      returnAt: row.return_at,
      airline: row.airline,
      flightNumber: row.flight_number,
      transfers: row.transfers,
      durationMinutes: null,
      adultPrice: row.price,
      currency: ctx.currency,
      deepLink: null,
      gate: null,
      provider: 'travelpayouts',
      ages: ctx.ages,
      passengers: ctx.passengers,
      cabin: ctx.cabin,
      requestedDepartDate: ctx.departDate,
      requestedReturnDate: ctx.returnDate,
    });
    if (normalized) offers.push(normalized);
  }
  return offers;
}

function daysBetween(a, b) {
  const da = new Date(`${a}T12:00:00Z`).getTime();
  const db = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((db - da) / 86400000);
}

async function searchTravelpayouts({
  origin,
  destination,
  departDate,
  returnDate,
  ages,
  passengers,
  cabin,
}) {
  const originCity = cityCode(origin);
  const destinationCity = cityCode(destination);
  const month = monthOf(departDate);
  const ctx = {
    originAirport: origin,
    destinationAirport: destination,
    originCity,
    destinationCity,
    departDate,
    returnDate,
    ages,
    passengers,
    cabin,
    currency: 'USD',
  };

  const oneWay = !returnDate;
  const requests = [
    tpGet('/aviasales/v3/prices_for_dates', {
      origin: originCity,
      destination: destinationCity,
      departure_at: departDate,
      ...(returnDate ? { return_at: returnDate } : { one_way: true }),
      sorting: 'price',
      limit: 30,
      unique: false,
    }).catch((e) => ({ __error: e.message })),
    tpGet('/aviasales/v3/prices_for_dates', {
      origin: originCity,
      destination: destinationCity,
      departure_at: month,
      ...(returnDate ? { return_at: monthOf(returnDate) } : { one_way: true }),
      sorting: 'price',
      limit: 30,
      unique: false,
    }).catch((e) => ({ __error: e.message })),
    tpGet('/v1/prices/cheap', {
      origin: originCity,
      destination: destinationCity,
      depart_date: departDate,
      ...(returnDate ? { return_date: returnDate } : {}),
    }).catch((e) => ({ __error: e.message })),
    tpGet('/v1/prices/cheap', {
      origin: originCity,
      destination: destinationCity,
      depart_date: month,
      ...(returnDate ? { return_date: monthOf(returnDate) } : {}),
    }).catch((e) => ({ __error: e.message })),
    tpGet('/v1/prices/calendar', {
      origin: originCity,
      destination: destinationCity,
      depart_date: month,
      calendar_type: 'departure_date',
    }).catch((e) => ({ __error: e.message })),
  ];

  // Also try airport codes directly (some routes index that way)
  if (origin !== originCity || destination !== destinationCity) {
    requests.push(
      tpGet('/aviasales/v3/prices_for_dates', {
        origin,
        destination,
        departure_at: month,
        ...(oneWay ? { one_way: true } : {}),
        sorting: 'price',
        limit: 20,
        unique: false,
      }).catch((e) => ({ __error: e.message }))
    );
  }

  const results = await Promise.all(requests);
  const offers = [];
  let errors = 0;

  for (const res of results) {
    if (!res || res.__error) {
      errors += 1;
      continue;
    }
    if (Array.isArray(res.data)) {
      offers.push(...collectPricesForDates(res.data, ctx));
    } else if (res.data && typeof res.data === 'object') {
      // calendar: data[YYYY-MM-DD] = { price, departure_at, ... }
      // cheap:    data[DEST][transfers] = { price, airline, ... }
      const firstVal = Object.values(res.data)[0];
      if (firstVal && typeof firstVal === 'object' && 'price' in firstVal && 'departure_at' in firstVal) {
        offers.push(...collectCalendar(res.data, ctx));
      } else {
        offers.push(...collectCheapBuckets(res.data, ctx));
      }
    }
  }

  if (!offers.length && errors) {
    logger.warn(`Travelpayouts returned no offers (${errors} request errors)`);
  }

  return offers;
}

async function searchDuffel({
  origin,
  destination,
  departDate,
  returnDate,
  ages,
  passengers,
  cabin,
}) {
  const token = duffelToken();
  if (!token) return [];

  const list = Array.isArray(ages) && ages.length
    ? ages
    : Array(Math.max(1, passengers || 1)).fill(30);

  const passengersPayload = list.map((age) => {
    if (age < 2) return { type: 'infant_without_seat' };
    if (age < 12) return { type: 'child' };
    return { type: 'adult' };
  });
  // Duffel requires at least one adult for most requests
  if (!passengersPayload.some((p) => p.type === 'adult')) {
    passengersPayload[0] = { type: 'adult' };
  }

  const slices = [
    { origin, destination, departure_date: departDate },
  ];
  if (returnDate) {
    slices.push({ origin: destination, destination: origin, departure_date: returnDate });
  }

  const cabinClass = cabin === 'business'
    ? 'business'
    : cabin === 'premium'
      ? 'premium_economy'
      : 'economy';

  try {
    const { data } = await axios.post(
      'https://api.duffel.com/air/offer_requests',
      {
        data: {
          slices,
          passengers: passengersPayload,
          cabin_class: cabinClass,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Duffel-Version': 'v2',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        params: { return_offers: 'true' },
        timeout: 20000,
      }
    );

    const offers = data?.data?.offers || [];
    return offers.slice(0, 25).map((o) => {
      const slice = o.slices?.[0];
      const segs = (slice?.segments || []).map((s) => ({
        origin: s.origin?.iata_code,
        destination: s.destination?.iata_code,
        airline: s.marketing_carrier?.iata_code,
        airlineName: s.marketing_carrier?.name || airlineName(s.marketing_carrier?.iata_code),
        flightNumber: `${s.marketing_carrier?.iata_code || ''}${s.marketing_carrier_flight_number || ''}`,
        departAt: s.departing_at,
        arriveAt: s.arriving_at,
        durationMin: Math.round((new Date(s.arriving_at) - new Date(s.departing_at)) / 60000),
        durationLabel: formatDuration(Math.round((new Date(s.arriving_at) - new Date(s.departing_at)) / 60000)),
      }));
      const stopAirports = segs.slice(0, -1).map((s) => s.destination).filter(Boolean);
      const stops = Math.max(0, segs.length - 1);
      const durationMinutes = segs.reduce((n, s) => n + (s.durationMin || 0), 0)
        + (slice?.duration ? parseIsoDurationMinutes(slice.duration) : 0);
      const dur = durationMinutes || parseIsoDurationMinutes(slice?.duration) || 180;
      const totalAmount = Number(o.total_amount);
      if (!Number.isFinite(totalAmount)) return null;

      return {
        id: `live-duffel-${o.id}`,
        origin: segs[0]?.origin || origin,
        destination: segs[segs.length - 1]?.destination || destination,
        departDate,
        returnDate: returnDate || null,
        cabin: cabin || 'economy',
        passengers: list.length,
        ages: list,
        passengerSummary: passengerSummary(list),
        price: Math.round(totalAmount),
        currency: String(o.total_currency || 'USD').toUpperCase(),
        adultPrice: Math.round(totalAmount / fareUnits(list)),
        stops,
        stopAirports,
        stopsLabel: stopsLabel(stops, stopAirports),
        durationMinutes: dur,
        durationLabel: formatDuration(dur),
        airlines: [...new Set(segs.map((s) => s.airlineName).filter(Boolean))],
        segments: segs,
        comfortScore: stops === 0 ? 4.3 : 3.7,
        baggageIncluded: Boolean(o.passengers?.[0]?.baggages?.length),
        refundable: false,
        source: 'duffel',
        live: true,
        pricingNote: 'Live Duffel offer — confirm before booking; offers expire quickly.',
        deepLink: null,
        duffelOfferId: o.id,
      };
    }).filter(Boolean);
  } catch (error) {
    logger.warn('Duffel search failed:', error.response?.data?.errors?.[0]?.message || error.message);
    return [];
  }
}

function parseIsoDurationMinutes(iso) {
  if (!iso || typeof iso !== 'string') return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return 0;
  return (Number(m[1]) || 0) * 60 + (Number(m[2]) || 0);
}

function dedupeKeepCheapest(offers) {
  const map = new Map();
  for (const offer of offers) {
    const depDay = (offer.departDate || '').slice(0, 10);
    const key = [
      offer.origin,
      offer.destination,
      depDay,
      offer.returnDate || '',
      offer.stops,
      (offer.airlines || []).join(','),
      offer.segments?.[0]?.flightNumber || '',
    ].join('|');
    const prev = map.get(key);
    if (!prev || offer.price < prev.price) map.set(key, offer);
  }
  return [...map.values()].sort((a, b) => a.price - b.price);
}

/**
 * Search live market fares across configured providers.
 * @returns {{ offers: object[], providers: string[], live: boolean, errors: string[] }}
 */
async function searchLiveOffers(input = {}) {
  if (!liveFaresEnabled()) {
    return { offers: [], providers: [], live: false, errors: [], disabled: true };
  }

  const providers = [];
  const errors = [];
  const collected = [];

  const tasks = [
    searchTravelpayouts(input)
      .then((offers) => {
        if (offers.length) providers.push('travelpayouts');
        collected.push(...offers);
      })
      .catch((e) => {
        errors.push(`travelpayouts: ${e.message}`);
        logger.warn('Travelpayouts search failed:', e.message);
      }),
  ];

  if (duffelToken()) {
    tasks.push(
      searchDuffel(input)
        .then((offers) => {
          if (offers.length) providers.push('duffel');
          collected.push(...offers);
        })
        .catch((e) => {
          errors.push(`duffel: ${e.message}`);
        })
    );
  }

  await Promise.all(tasks);

  const offers = dedupeKeepCheapest(collected).slice(0, 40);
  return {
    offers,
    providers,
    live: offers.length > 0,
    errors,
    disabled: false,
  };
}

module.exports = {
  searchLiveOffers,
  liveFaresEnabled,
  cityCode,
  fareUnits,
  travelpayoutsToken,
  dedupeKeepCheapest,
  normalizeMarketOffer,
  AIRPORT_TO_CITY,
};
