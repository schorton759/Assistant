/**
 * Deterministic flight offer catalog.
 * Generates realistic multi-airline options for ranking by AI agents.
 * When SERPER_API_KEY is present, web snippets can enrich context (optional).
 */

const AIRLINES = [
  { code: 'AA', name: 'American Airlines', vibe: 'reliable' },
  { code: 'UA', name: 'United Airlines', vibe: 'network' },
  { code: 'DL', name: 'Delta Air Lines', vibe: 'premium-economy' },
  { code: 'BA', name: 'British Airways', vibe: 'transatlantic' },
  { code: 'AF', name: 'Air France', vibe: 'hub-paris' },
  { code: 'LH', name: 'Lufthansa', vibe: 'hub-frankfurt' },
  { code: 'EK', name: 'Emirates', vibe: 'long-haul-comfort' },
  { code: 'QR', name: 'Qatar Airways', vibe: 'award-winning' },
  { code: 'SQ', name: 'Singapore Airlines', vibe: 'premium' },
  { code: 'JL', name: 'Japan Airlines', vibe: 'punctual' },
  { code: 'NH', name: 'ANA', vibe: 'smooth' },
  { code: 'B6', name: 'JetBlue', vibe: 'value' },
  { code: 'AS', name: 'Alaska Airlines', vibe: 'west-coast' },
  { code: 'NK', name: 'Spirit', vibe: 'ultra-low-cost' },
  { code: 'F9', name: 'Frontier', vibe: 'budget' },
];

const HUBS = {
  JFK: ['LHR', 'CDG', 'AMS', 'FRA', 'MAD', 'DXB'],
  EWR: ['LHR', 'CDG', 'FRA'],
  LGA: ['ORD', 'ATL', 'MIA'],
  LAX: ['NRT', 'HND', 'ICN', 'SYD', 'LHR', 'CDG'],
  SFO: ['NRT', 'HND', 'ICN', 'LHR', 'CDG', 'SIN'],
  SEA: ['NRT', 'ICN', 'LHR'],
  ORD: ['LHR', 'FRA', 'CDG', 'NRT'],
  ATL: ['LHR', 'CDG', 'AMS', 'FRA'],
  MIA: ['LHR', 'CDG', 'GRU', 'BOG'],
  BOS: ['LHR', 'CDG', 'AMS', 'DUB'],
  LHR: ['JFK', 'EWR', 'BOS', 'LAX', 'SFO', 'DXB', 'SIN'],
  CDG: ['JFK', 'LAX', 'SFO', 'DXB', 'NRT'],
  FRA: ['JFK', 'ORD', 'SFO', 'NRT', 'SIN'],
  AMS: ['JFK', 'BOS', 'SFO'],
  DXB: ['JFK', 'LHR', 'SIN', 'SYD', 'NRT'],
  NRT: ['LAX', 'SFO', 'SEA', 'JFK', 'SIN', 'BKK'],
  HND: ['LAX', 'SFO', 'SEA'],
  ICN: ['LAX', 'SFO', 'SEA', 'JFK'],
  SIN: ['LAX', 'SFO', 'LHR', 'SYD', 'NRT'],
  SYD: ['LAX', 'SFO', 'SIN', 'NRT'],
  BKK: ['NRT', 'SIN', 'LHR'],
};

const CITY_TO_AIRPORTS = {
  NEW_YORK: ['JFK', 'EWR', 'LGA'],
  NYC: ['JFK', 'EWR', 'LGA'],
  LONDON: ['LHR', 'LGW', 'STN'],
  PARIS: ['CDG', 'ORY'],
  TOKYO: ['NRT', 'HND'],
  LOS_ANGELES: ['LAX'],
  SAN_FRANCISCO: ['SFO'],
  CHICAGO: ['ORD', 'MDW'],
  MIAMI: ['MIA'],
  BOSTON: ['BOS'],
  SEATTLE: ['SEA'],
  DUBAI: ['DXB'],
  SINGAPORE: ['SIN'],
  SYDNEY: ['SYD'],
  BANGKOK: ['BKK'],
  SEOUL: ['ICN'],
  FRANKFURT: ['FRA'],
  AMSTERDAM: ['AMS'],
};

function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function normalizeAirport(codeOrCity) {
  if (!codeOrCity) return null;
  const raw = String(codeOrCity).trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  const key = raw.replace(/[^A-Z]/g, ' ').replace(/\s+/g, '_');
  const mapped = CITY_TO_AIRPORTS[key] || CITY_TO_AIRPORTS[key.replace(/_/g, '')];
  return mapped ? mapped[0] : raw.slice(0, 3);
}

function distanceScore(origin, destination) {
  const domesticUS = ['JFK', 'EWR', 'LGA', 'LAX', 'SFO', 'SEA', 'ORD', 'ATL', 'MIA', 'BOS', 'DEN', 'DFW', 'IAH'];
  const europe = ['LHR', 'LGW', 'CDG', 'ORY', 'FRA', 'AMS', 'MAD', 'FCO', 'DUB', 'ZRH'];
  const asia = ['NRT', 'HND', 'ICN', 'SIN', 'BKK', 'HKG', 'PVG'];
  const middleEast = ['DXB', 'DOH', 'AUH'];

  const region = (code) => {
    if (domesticUS.includes(code)) return 'us';
    if (europe.includes(code)) return 'eu';
    if (asia.includes(code)) return 'as';
    if (middleEast.includes(code)) return 'me';
    return 'other';
  };

  const a = region(origin);
  const b = region(destination);
  if (a === b && a === 'us') return 1;
  if (a === b) return 1.4;
  if ((a === 'us' && b === 'eu') || (a === 'eu' && b === 'us')) return 2.2;
  if ((a === 'us' && b === 'as') || (a === 'as' && b === 'us')) return 3.4;
  if ((a === 'us' && b === 'me') || (a === 'me' && b === 'us')) return 3.0;
  return 2.6;
}

function addHours(isoDate, hours) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  const delta = Number(hours);
  d.setTime(d.getTime() + (Number.isFinite(delta) ? delta : 0) * 3600 * 1000);
  return d.toISOString();
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function pickLayover(origin, destination, rand) {
  const candidates = [
    ...(HUBS[origin] || []),
    ...(HUBS[destination] || []),
    'LHR',
    'CDG',
    'FRA',
    'DXB',
    'DOH',
    'IST',
    'ORD',
    'ATL',
  ].filter((c) => c !== origin && c !== destination);

  const unique = [...new Set(candidates)];
  if (!unique.length) return 'ORD';
  return unique[Math.floor(rand() * unique.length)];
}

function buildSegment({ airline, origin, destination, departAt, durationMin, flightNum }) {
  return {
    airline: airline.code,
    airlineName: airline.name,
    flightNumber: `${airline.code}${flightNum}`,
    origin,
    destination,
    departAt,
    arriveAt: addHours(departAt, durationMin / 60),
    durationMinutes: durationMin,
    durationLabel: formatDuration(durationMin),
  };
}

function generateOffers({
  origin,
  destination,
  departDate,
  returnDate = null,
  cabin = 'economy',
  passengers = 1,
  count = 12,
}) {
  const from = normalizeAirport(origin);
  const to = normalizeAirport(destination);
  if (!from || !to) {
    throw new Error('Origin and destination are required');
  }

  const seed = hashString(`${from}|${to}|${departDate}|${returnDate || ''}|${cabin}|${passengers}`);
  const rand = seededRandom(seed);
  const dist = distanceScore(from, to);
  const basePrice = Math.round((180 + dist * 210) * (cabin === 'business' ? 3.2 : cabin === 'premium' ? 1.7 : 1));
  const baseDuration = Math.round(90 + dist * 280);

  const offers = [];

  for (let i = 0; i < count; i += 1) {
    const airline = AIRLINES[Math.floor(rand() * AIRLINES.length)];
    const stops = i % 5 === 0 ? 0 : i % 3 === 0 ? 2 : 1;
    const departHour = 5 + Math.floor(rand() * 16);
    const departMinute = [0, 15, 30, 45][Math.floor(rand() * 4)];
    const departAt = `${departDate}T${String(departHour).padStart(2, '0')}:${String(departMinute).padStart(2, '0')}:00.000Z`;

    let segments = [];
    let totalDuration = baseDuration;

    if (stops === 0) {
      // Nonstop: slightly pricier, faster
      totalDuration = Math.round(baseDuration * (0.78 + rand() * 0.08));
      segments = [
        buildSegment({
          airline,
          origin: from,
          destination: to,
          departAt,
          durationMin: totalDuration,
          flightNum: 100 + Math.floor(rand() * 800),
        }),
      ];
    } else if (stops === 1) {
      const hub = pickLayover(from, to, rand);
      const leg1 = Math.round(baseDuration * (0.35 + rand() * 0.2));
      const layover = 55 + Math.floor(rand() * 140);
      const leg2 = Math.round(baseDuration * (0.35 + rand() * 0.25));
      totalDuration = leg1 + layover + leg2;
      const secondAirline = rand() > 0.7 ? AIRLINES[Math.floor(rand() * AIRLINES.length)] : airline;
      segments = [
        buildSegment({
          airline,
          origin: from,
          destination: hub,
          departAt,
          durationMin: leg1,
          flightNum: 100 + Math.floor(rand() * 800),
        }),
        buildSegment({
          airline: secondAirline,
          origin: hub,
          destination: to,
          departAt: addHours(departAt, (leg1 + layover) / 60),
          durationMin: leg2,
          flightNum: 100 + Math.floor(rand() * 800),
        }),
      ];
    } else {
      const hub1 = pickLayover(from, to, rand);
      const hub2 = pickLayover(from, to, rand);
      const parts = [
        Math.round(baseDuration * 0.28),
        70 + Math.floor(rand() * 100),
        Math.round(baseDuration * 0.3),
        60 + Math.floor(rand() * 90),
        Math.round(baseDuration * 0.28),
      ];
      totalDuration = parts.reduce((a, b) => a + b, 0);
      let cursor = departAt;
      let hubA = hub1;
      let hubB = hub2;
      if (hubA === hubB) {
        hubB = pickLayover(from, to, rand);
        if (hubB === hubA) hubB = hubA === 'ORD' ? 'ATL' : 'ORD';
      }
      const path = [from, hubA, hubB, to];
      segments = [];
      for (let s = 0; s < 3; s += 1) {
        const carrier = s === 0 ? airline : AIRLINES[Math.floor(rand() * AIRLINES.length)];
        const seg = buildSegment({
          airline: carrier,
          origin: path[s],
          destination: path[s + 1],
          departAt: cursor,
          durationMin: parts[s * 2],
          flightNum: 100 + Math.floor(rand() * 800),
        });
        segments.push(seg);
        if (s < 2) {
          cursor = addHours(seg.arriveAt, parts[s * 2 + 1] / 60);
        }
      }
    }

    // Price shaping: nonstop premium, ultra-low-cost discount, multi-stop cheap
    let price = basePrice;
    price *= 0.85 + rand() * 0.45;
    if (stops === 0) price *= 1.18 + rand() * 0.15;
    if (stops === 2) price *= 0.72 + rand() * 0.12;
    if (['NK', 'F9'].includes(airline.code)) price *= 0.68;
    if (['SQ', 'QR', 'EK'].includes(airline.code) && stops <= 1) price *= 1.12;
    price = Math.round(price * passengers);

    const comfort =
      airline.vibe.includes('premium') || airline.vibe.includes('award')
        ? 4.4 + rand() * 0.5
        : ['NK', 'F9'].includes(airline.code)
          ? 2.4 + rand() * 0.6
          : 3.2 + rand() * 1.0;

    const offer = {
      id: `sky-${from}${to}-${seed.toString(16)}-${i}`,
      origin: from,
      destination: to,
      departDate,
      returnDate,
      cabin,
      passengers,
      price,
      currency: 'USD',
      stops,
      stopsLabel: stops === 0 ? 'Nonstop' : stops === 1 ? '1 stop' : `${stops} stops`,
      durationMinutes: totalDuration,
      durationLabel: formatDuration(totalDuration),
      airlines: [...new Set(segments.map((s) => s.airlineName))],
      segments,
      comfortScore: Number(comfort.toFixed(1)),
      baggageIncluded: !['NK', 'F9'].includes(airline.code),
      refundable: price > basePrice * 1.1 && rand() > 0.6,
      source: 'skyagent-catalog',
    };

    if (returnDate) {
      const retDuration = Math.round(totalDuration * (0.95 + rand() * 0.1));
      offer.return = {
        departDate: returnDate,
        durationMinutes: retDuration,
        durationLabel: formatDuration(retDuration),
        priceDelta: Math.round(price * 0.92),
      };
      offer.price = Math.round(offer.price + offer.return.priceDelta);
    }

    offers.push(offer);
  }

  return offers.sort((a, b) => a.price - b.price);
}

module.exports = {
  generateOffers,
  normalizeAirport,
  CITY_TO_AIRPORTS,
};
