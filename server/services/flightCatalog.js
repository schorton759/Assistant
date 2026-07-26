/**
 * Route-aware flight catalog.
 * Only invents itineraries that match plausible airline networks —
 * no Qatar nonstop from Bermuda, no Frontier across the Atlantic, etc.
 */

const AIRLINES = {
  AA: {
    code: 'AA',
    name: 'American Airlines',
    vibe: 'reliable',
    hubs: ['DFW', 'CLT', 'ORD', 'MIA', 'PHL', 'JFK'],
    regions: ['us', 'eu', 'caribbean'],
  },
  UA: {
    code: 'UA',
    name: 'United Airlines',
    vibe: 'network',
    hubs: ['EWR', 'ORD', 'IAH', 'DEN', 'SFO', 'IAD'],
    regions: ['us', 'eu', 'as', 'caribbean'],
  },
  DL: {
    code: 'DL',
    name: 'Delta Air Lines',
    vibe: 'premium-economy',
    hubs: ['ATL', 'JFK', 'DTW', 'MSP', 'SEA', 'BOS'],
    regions: ['us', 'eu', 'as', 'caribbean'],
  },
  BA: {
    code: 'BA',
    name: 'British Airways',
    vibe: 'transatlantic',
    hubs: ['LHR', 'LGW'],
    regions: ['eu', 'us', 'caribbean'],
  },
  AF: {
    code: 'AF',
    name: 'Air France',
    vibe: 'hub-paris',
    hubs: ['CDG'],
    regions: ['eu', 'us', 'as', 'me'],
  },
  LH: {
    code: 'LH',
    name: 'Lufthansa',
    vibe: 'hub-frankfurt',
    hubs: ['FRA', 'MUC'],
    regions: ['eu', 'us', 'as', 'me'],
  },
  EK: {
    code: 'EK',
    name: 'Emirates',
    vibe: 'long-haul-comfort',
    hubs: ['DXB'],
    regions: ['me', 'eu', 'as', 'us'],
  },
  QR: {
    code: 'QR',
    name: 'Qatar Airways',
    vibe: 'award-winning',
    hubs: ['DOH'],
    regions: ['me', 'eu', 'as', 'us'],
  },
  SQ: {
    code: 'SQ',
    name: 'Singapore Airlines',
    vibe: 'premium',
    hubs: ['SIN'],
    regions: ['as', 'eu', 'us'],
  },
  JL: {
    code: 'JL',
    name: 'Japan Airlines',
    vibe: 'punctual',
    hubs: ['NRT', 'HND'],
    regions: ['as', 'us'],
  },
  NH: {
    code: 'NH',
    name: 'ANA',
    vibe: 'smooth',
    hubs: ['NRT', 'HND'],
    regions: ['as', 'us'],
  },
  B6: {
    code: 'B6',
    name: 'JetBlue',
    vibe: 'value',
    hubs: ['JFK', 'BOS', 'FLL', 'MCO'],
    regions: ['us', 'caribbean'],
  },
  AS: {
    code: 'AS',
    name: 'Alaska Airlines',
    vibe: 'west-coast',
    hubs: ['SEA', 'PDX', 'SFO', 'LAX'],
    regions: ['us'],
  },
  VS: {
    code: 'VS',
    name: 'Virgin Atlantic',
    vibe: 'premium',
    hubs: ['LHR', 'LGW', 'MAN'],
    regions: ['eu', 'us'],
  },
  AC: {
    code: 'AC',
    name: 'Air Canada',
    vibe: 'network',
    hubs: ['YYZ', 'YUL', 'YVR'],
    regions: ['us', 'eu', 'caribbean'],
  },
};

/** Plausible nonstop markets (undirected). ULCC excluded from long-haul. */
const NONSTOP_MARKETS = [
  // US domestic / transcon
  ['JFK', 'LAX'], ['JFK', 'SFO'], ['JFK', 'MIA'], ['JFK', 'BOS'], ['JFK', 'ORD'], ['JFK', 'ATL'],
  ['EWR', 'LAX'], ['EWR', 'SFO'], ['EWR', 'ORD'], ['EWR', 'MIA'],
  ['BOS', 'LAX'], ['BOS', 'SFO'], ['BOS', 'ORD'], ['BOS', 'ATL'], ['BOS', 'MIA'],
  ['LAX', 'SFO'], ['LAX', 'SEA'], ['LAX', 'ORD'], ['LAX', 'ATL'], ['LAX', 'MIA'],
  ['SFO', 'SEA'], ['SFO', 'ORD'], ['SFO', 'ATL'],
  ['SEA', 'ORD'], ['SEA', 'ATL'], ['ORD', 'ATL'], ['ORD', 'MIA'], ['ATL', 'MIA'],
  // Transatlantic
  ['JFK', 'LHR'], ['JFK', 'CDG'], ['JFK', 'AMS'], ['JFK', 'FRA'], ['JFK', 'DUB'], ['JFK', 'MAD'],
  ['EWR', 'LHR'], ['EWR', 'CDG'], ['EWR', 'FRA'],
  ['BOS', 'LHR'], ['BOS', 'CDG'], ['BOS', 'DUB'], ['BOS', 'AMS'],
  ['ORD', 'LHR'], ['ORD', 'CDG'], ['ORD', 'FRA'],
  ['ATL', 'LHR'], ['ATL', 'CDG'], ['ATL', 'AMS'], ['ATL', 'FRA'],
  ['MIA', 'LHR'], ['MIA', 'CDG'], ['MIA', 'MAD'],
  ['LAX', 'LHR'], ['LAX', 'CDG'], ['SFO', 'LHR'], ['SFO', 'CDG'], ['SEA', 'LHR'],
  // Transpacific / Asia
  ['LAX', 'NRT'], ['LAX', 'HND'], ['LAX', 'ICN'], ['LAX', 'SIN'], ['LAX', 'SYD'],
  ['SFO', 'NRT'], ['SFO', 'HND'], ['SFO', 'ICN'], ['SFO', 'SIN'], ['SFO', 'SYD'],
  ['SEA', 'NRT'], ['SEA', 'ICN'], ['JFK', 'NRT'], ['ORD', 'NRT'],
  // Middle East long-haul spokes (hub carriers only)
  ['JFK', 'DXB'], ['JFK', 'DOH'], ['LHR', 'DXB'], ['LHR', 'DOH'], ['LHR', 'SIN'],
  ['CDG', 'DXB'], ['FRA', 'DXB'], ['SIN', 'SYD'], ['SIN', 'NRT'], ['SIN', 'BKK'],
  ['NRT', 'BKK'], ['DXB', 'SIN'], ['DXB', 'SYD'], ['DOH', 'SIN'],
  // Bermuda — real-world-ish nonstops
  ['BDA', 'JFK'], ['BDA', 'EWR'], ['BDA', 'BOS'], ['BDA', 'ATL'], ['BDA', 'PHL'],
  ['BDA', 'CLT'], ['BDA', 'LGW'], ['BDA', 'LHR'], ['BDA', 'YYZ'],
];

/** Which airlines may operate a nonstop on a market */
const NONSTOP_CARRIERS = {
  'BDA-JFK': ['B6', 'AA', 'DL'],
  'BDA-EWR': ['UA'],
  'BDA-BOS': ['B6', 'DL'],
  'BDA-ATL': ['DL'],
  'BDA-PHL': ['AA'],
  'BDA-CLT': ['AA'],
  'BDA-LGW': ['BA'],
  'BDA-LHR': ['BA'],
  'BDA-YYZ': ['AC'],
  'JFK-LHR': ['BA', 'AA', 'VS', 'DL'],
  'EWR-LHR': ['UA', 'BA'],
  'BOS-LHR': ['BA', 'VS', 'DL'],
  'ORD-LHR': ['UA', 'AA', 'BA'],
  'ATL-LHR': ['DL', 'VS'],
  'MIA-LHR': ['AA', 'BA', 'VS'],
  'LAX-LHR': ['BA', 'AA', 'VS', 'UA'],
  'SFO-LHR': ['BA', 'UA', 'VS'],
  'SEA-LHR': ['BA', 'DL'],
  'JFK-CDG': ['AF', 'DL', 'AA'],
  'JFK-FRA': ['LH', 'UA'],
  'JFK-AMS': ['DL'],
  'JFK-DXB': ['EK'],
  'JFK-DOH': ['QR'],
  'LHR-DXB': ['EK', 'BA'],
  'LHR-DOH': ['QR', 'BA'],
  'LHR-SIN': ['SQ', 'BA'],
  'LAX-NRT': ['JL', 'NH', 'UA', 'AA'],
  'SFO-NRT': ['UA', 'JL', 'NH'],
  'LAX-HND': ['JL', 'NH', 'AA'],
  'SFO-HND': ['UA', 'NH', 'JL'],
  'LAX-ICN': ['DL', 'UA'],
  'SFO-ICN': ['UA'],
  'LAX-SIN': ['SQ', 'UA'],
  'SFO-SIN': ['UA', 'SQ'],
  'LAX-SYD': ['UA', 'AA', 'DL'],
  'SFO-SYD': ['UA'],
};

const CITY_TO_AIRPORTS = {
  NEW_YORK: ['JFK', 'EWR', 'LGA'],
  NYC: ['JFK', 'EWR', 'LGA'],
  LONDON: ['LHR', 'LGW'],
  PARIS: ['CDG', 'ORY'],
  TOKYO: ['NRT', 'HND'],
  LOS_ANGELES: ['LAX'],
  SAN_FRANCISCO: ['SFO'],
  CHICAGO: ['ORD', 'MDW'],
  MIAMI: ['MIA'],
  BOSTON: ['BOS'],
  SEATTLE: ['SEA'],
  DUBAI: ['DXB'],
  DOHA: ['DOH'],
  SINGAPORE: ['SIN'],
  SYDNEY: ['SYD'],
  BANGKOK: ['BKK'],
  SEOUL: ['ICN'],
  FRANKFURT: ['FRA'],
  AMSTERDAM: ['AMS'],
  BERMUDA: ['BDA'],
  HAMILTON: ['BDA'],
  TORONTO: ['YYZ'],
  PHILADELPHIA: ['PHL'],
  CHARLOTTE: ['CLT'],
  ATLANTA: ['ATL'],
  DALLAS: ['DFW'],
  HOUSTON: ['IAH'],
  DENVER: ['DEN'],
  WASHINGTON: ['IAD'],
  MONTREAL: ['YUL'],
  VANCOUVER: ['YVR'],
};

const REGION_OF = {
  us: new Set([
    'JFK', 'EWR', 'LGA', 'LAX', 'SFO', 'SEA', 'ORD', 'ATL', 'MIA', 'BOS',
    'DEN', 'DFW', 'IAH', 'PHL', 'CLT', 'IAD', 'DTW', 'MSP', 'FLL', 'MCO', 'PDX',
  ]),
  eu: new Set(['LHR', 'LGW', 'CDG', 'ORY', 'FRA', 'MUC', 'AMS', 'MAD', 'FCO', 'DUB', 'ZRH', 'MAN']),
  as: new Set(['NRT', 'HND', 'ICN', 'SIN', 'BKK', 'HKG', 'PVG']),
  me: new Set(['DXB', 'DOH', 'AUH']),
  caribbean: new Set(['BDA', 'NAS', 'CUN', 'SJU']),
  ca: new Set(['YYZ', 'YUL', 'YVR']),
};

function regionOf(code) {
  for (const [name, set] of Object.entries(REGION_OF)) {
    if (set.has(code)) return name;
  }
  return 'other';
}

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
  if (mapped) return mapped[0];
  // fuzzy: "BERMUDA" contained in longer phrases already handled by intent agent
  for (const [city, codes] of Object.entries(CITY_TO_AIRPORTS)) {
    if (key.includes(city) || city.includes(key)) return codes[0];
  }
  return raw.slice(0, 3);
}

function marketKey(a, b) {
  return [a, b].sort().join('-');
}

function pairKey(a, b) {
  return `${a}-${b}`;
}

function hasNonstopMarket(a, b) {
  return NONSTOP_MARKETS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a)
  );
}

function carriersForNonstop(a, b) {
  const direct = NONSTOP_CARRIERS[pairKey(a, b)] || NONSTOP_CARRIERS[pairKey(b, a)];
  if (direct) return direct.map((c) => AIRLINES[c]).filter(Boolean);

  // Domestic US fallback: legacy carriers + JetBlue/Alaska by coast
  const ra = regionOf(a);
  const rb = regionOf(b);
  if (ra === 'us' && rb === 'us') {
    const pool = ['AA', 'UA', 'DL'];
    if (['JFK', 'BOS', 'FLL', 'MCO'].includes(a) || ['JFK', 'BOS', 'FLL', 'MCO'].includes(b)) {
      pool.push('B6');
    }
    if (['SEA', 'PDX', 'SFO', 'LAX'].includes(a) && ['SEA', 'PDX', 'SFO', 'LAX'].includes(b)) {
      pool.push('AS');
    }
    return pool.map((c) => AIRLINES[c]);
  }
  return [];
}

function distanceScore(origin, destination) {
  const a = regionOf(origin);
  const b = regionOf(destination);
  if (a === b && (a === 'us' || a === 'eu' || a === 'as')) return 1;
  if ((a === 'caribbean' && b === 'us') || (b === 'caribbean' && a === 'us')) return 1.3;
  if ((a === 'caribbean' && b === 'eu') || (b === 'caribbean' && a === 'eu')) return 2.0;
  if ((a === 'us' && b === 'eu') || (a === 'eu' && b === 'us')) return 2.2;
  if ((a === 'us' && b === 'as') || (a === 'as' && b === 'us')) return 3.4;
  if ((a === 'us' && b === 'me') || (a === 'me' && b === 'us')) return 3.0;
  if ((a === 'eu' && b === 'me') || (a === 'me' && b === 'eu')) return 1.8;
  if ((a === 'ca' && (b === 'us' || b === 'eu' || b === 'caribbean')) ||
      (b === 'ca' && (a === 'us' || a === 'eu' || a === 'caribbean'))) return 1.6;
  return 2.6;
}

function addHours(isoDate, hours) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${isoDate}`);
  const delta = Number(hours);
  d.setTime(d.getTime() + (Number.isFinite(delta) ? delta : 0) * 3600 * 1000);
  return d.toISOString();
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
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

/** Connection hubs that make sense for a route / marketing airline */
function connectionHubs(origin, destination, airline) {
  const hubs = [];
  const push = (...codes) => {
    for (const c of codes) {
      if (c && c !== origin && c !== destination && !hubs.includes(c)) hubs.push(c);
    }
  };

  // Prefer the marketing airline's own hubs
  if (airline?.hubs) push(...airline.hubs);

  const o = regionOf(origin);
  const d = regionOf(destination);

  // Bermuda / Caribbean → Europe almost always via US or BA London gateway
  if (o === 'caribbean' || d === 'caribbean') {
    push('JFK', 'EWR', 'BOS', 'ATL', 'PHL', 'CLT', 'YYZ', 'LGW', 'LHR');
  }
  if ((o === 'us' && d === 'eu') || (o === 'eu' && d === 'us')) {
    push('LHR', 'CDG', 'FRA', 'AMS', 'DUB', 'JFK', 'EWR', 'BOS', 'ORD', 'ATL');
  }
  if ((o === 'us' && d === 'as') || (o === 'as' && d === 'us')) {
    push('NRT', 'HND', 'ICN', 'SFO', 'LAX', 'SEA', 'ORD');
  }
  if (o === 'me' || d === 'me') {
    push('DXB', 'DOH', 'LHR', 'FRA', 'JFK');
  }

  return hubs;
}

function airlinesForConnection(origin, destination) {
  const o = regionOf(origin);
  const d = regionOf(destination);
  const codes = new Set();

  const addByRegion = (...regions) => {
    for (const airline of Object.values(AIRLINES)) {
      if (regions.some((r) => airline.regions.includes(r))) codes.add(airline.code);
    }
  };

  if (o === 'caribbean' || d === 'caribbean') {
    // No Middle East / Asia hub carriers inventing Bermuda locals
    ['BA', 'AA', 'DL', 'UA', 'B6', 'AC', 'VS'].forEach((c) => codes.add(c));
  } else if ((o === 'us' && d === 'eu') || (o === 'eu' && d === 'us')) {
    ['BA', 'AA', 'UA', 'DL', 'VS', 'AF', 'LH'].forEach((c) => codes.add(c));
  } else if ((o === 'us' && d === 'as') || (o === 'as' && d === 'us')) {
    ['UA', 'AA', 'DL', 'JL', 'NH', 'SQ'].forEach((c) => codes.add(c));
  } else if (o === 'me' || d === 'me') {
    ['EK', 'QR', 'BA', 'AF', 'LH'].forEach((c) => codes.add(c));
  } else if (o === 'us' && d === 'us') {
    ['AA', 'UA', 'DL', 'B6', 'AS'].forEach((c) => codes.add(c));
  } else {
    addByRegion(o, d, 'us', 'eu');
  }

  return [...codes].map((c) => AIRLINES[c]).filter(Boolean);
}

function pick(arr, rand) {
  if (!arr.length) return null;
  return arr[Math.floor(rand() * arr.length)];
}

function operatingCarrierForLeg(from, to, marketingAirline, rand) {
  // Same carrier if it can touch both sides via its regions/hubs
  const nonstop = carriersForNonstop(from, to);
  if (nonstop.length) {
    if (nonstop.some((a) => a.code === marketingAirline.code)) return marketingAirline;
    return pick(nonstop, rand) || marketingAirline;
  }

  // Connecting short-haul feeder: prefer local network carriers
  const ra = regionOf(from);
  const rb = regionOf(to);
  if (ra === 'caribbean' || rb === 'caribbean') {
    return pick(
      ['BA', 'AA', 'DL', 'UA', 'B6', 'AC'].map((c) => AIRLINES[c]).filter(Boolean),
      rand
    ) || marketingAirline;
  }
  if (ra === 'us' && rb === 'us') {
    return pick(['AA', 'UA', 'DL', 'B6', 'AS'].map((c) => AIRLINES[c]), rand) || marketingAirline;
  }
  return marketingAirline;
}

function generateOffers({
  origin,
  destination,
  departDate,
  returnDate = null,
  cabin = 'economy',
  passengers = 1,
  count = 10,
}) {
  const from = normalizeAirport(origin);
  const to = normalizeAirport(destination);
  if (!from || !to) throw new Error('Origin and destination are required');

  const seed = hashString(`${from}|${to}|${departDate}|${returnDate || ''}|${cabin}|${passengers}|v2`);
  const rand = seededRandom(seed);
  const dist = distanceScore(from, to);
  const basePrice = Math.round((180 + dist * 210) * (cabin === 'business' ? 3.2 : cabin === 'premium' ? 1.7 : 1));
  const baseDuration = Math.round(90 + dist * 280);
  const canNonstop = hasNonstopMarket(from, to);
  const nonstopCarriers = carriersForNonstop(from, to);
  const connectionAirlines = airlinesForConnection(from, to);

  const offers = [];
  let attempts = 0;

  while (offers.length < count && attempts < count * 8) {
    attempts += 1;
    const wantNonstop = canNonstop && nonstopCarriers.length && (offers.filter((o) => o.stops === 0).length < 3) && rand() > 0.35;
    const wantTwoStop = !wantNonstop && rand() > 0.82;
    const stops = wantNonstop ? 0 : wantTwoStop ? 2 : 1;

    const departHour = 6 + Math.floor(rand() * 14);
    const departMinute = [0, 15, 30, 45][Math.floor(rand() * 4)];
    // Keep local-looking clock but store as ISO date + time Z for simplicity
    const departAt = `${departDate}T${String(departHour).padStart(2, '0')}:${String(departMinute).padStart(2, '0')}:00.000Z`;

    let airline;
    let segments = [];
    let totalDuration = baseDuration;

    if (stops === 0) {
      airline = pick(nonstopCarriers, rand);
      if (!airline) continue;
      totalDuration = Math.round(baseDuration * (0.78 + rand() * 0.1));
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
      airline = pick(connectionAirlines, rand);
      if (!airline) continue;
      const hubs = connectionHubs(from, to, airline);
      const hub = pick(hubs, rand);
      if (!hub) continue;

      // Avoid absurd Middle East detours for Caribbean↔Europe short trips
      if (
        (regionOf(from) === 'caribbean' || regionOf(to) === 'caribbean') &&
        ['DXB', 'DOH', 'SIN', 'NRT', 'HND', 'ICN'].includes(hub)
      ) {
        continue;
      }

      const leg1Carrier = operatingCarrierForLeg(from, hub, airline, rand);
      const leg2Carrier = operatingCarrierForLeg(hub, to, airline, rand);
      const leg1 = Math.round(baseDuration * (0.32 + rand() * 0.18));
      const layover = 60 + Math.floor(rand() * 120);
      const leg2 = Math.round(baseDuration * (0.32 + rand() * 0.2));
      totalDuration = leg1 + layover + leg2;
      segments = [
        buildSegment({
          airline: leg1Carrier,
          origin: from,
          destination: hub,
          departAt,
          durationMin: leg1,
          flightNum: 100 + Math.floor(rand() * 800),
        }),
        buildSegment({
          airline: leg2Carrier,
          origin: hub,
          destination: to,
          departAt: addHours(departAt, (leg1 + layover) / 60),
          durationMin: leg2,
          flightNum: 100 + Math.floor(rand() * 800),
        }),
      ];
    } else {
      airline = pick(connectionAirlines, rand);
      if (!airline) continue;
      const hubs = connectionHubs(from, to, airline);
      let hubA = pick(hubs, rand);
      let hubB = pick(hubs, rand);
      if (!hubA || !hubB) continue;
      if (hubA === hubB) {
        hubB = hubs.find((h) => h !== hubA) || (hubA === 'JFK' ? 'EWR' : 'JFK');
      }
      if (
        (regionOf(from) === 'caribbean' || regionOf(to) === 'caribbean') &&
        [hubA, hubB].some((h) => ['DXB', 'DOH', 'SIN', 'NRT'].includes(h))
      ) {
        continue;
      }

      const parts = [
        Math.round(baseDuration * 0.26),
        55 + Math.floor(rand() * 80),
        Math.round(baseDuration * 0.28),
        55 + Math.floor(rand() * 80),
        Math.round(baseDuration * 0.26),
      ];
      totalDuration = parts.reduce((a, b) => a + b, 0);
      const path = [from, hubA, hubB, to];
      let cursor = departAt;
      segments = [];
      for (let s = 0; s < 3; s += 1) {
        const carrier = operatingCarrierForLeg(path[s], path[s + 1], airline, rand);
        const seg = buildSegment({
          airline: carrier,
          origin: path[s],
          destination: path[s + 1],
          departAt: cursor,
          durationMin: parts[s * 2],
          flightNum: 100 + Math.floor(rand() * 800),
        });
        segments.push(seg);
        if (s < 2) cursor = addHours(seg.arriveAt, parts[s * 2 + 1] / 60);
      }
    }

    let price = basePrice * (0.88 + rand() * 0.4);
    if (stops === 0) price *= 1.15 + rand() * 0.12;
    if (stops === 2) price *= 0.78 + rand() * 0.1;
    if (['BA', 'VS', 'SQ', 'EK', 'QR'].includes(airline.code)) price *= 1.08;
    if (['B6'].includes(airline.code)) price *= 0.9;
    price = Math.round(price * passengers);

    const comfort =
      airline.vibe.includes('premium') || airline.vibe.includes('award')
        ? 4.3 + rand() * 0.5
        : airline.code === 'B6'
          ? 3.4 + rand() * 0.5
          : 3.5 + rand() * 0.8;

    const offer = {
      id: `sky-${from}${to}-${seed.toString(16)}-${offers.length}`,
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
      baggageIncluded: true,
      refundable: price > basePrice * 1.15 && rand() > 0.55,
      source: 'skyagent-catalog-v2',
      realisticNote: canNonstop
        ? 'Includes carriers known to serve this market'
        : 'No nonstop market — connections via realistic hubs only',
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

  // Guarantee at least a few offers even for obscure pairs via US/EU hubs
  if (!offers.length) {
    const airline = AIRLINES.BA || AIRLINES.AA;
    const hub = regionOf(from) === 'caribbean' ? 'JFK' : 'LHR';
    const departAt = `${departDate}T12:00:00.000Z`;
    const leg1 = Math.round(baseDuration * 0.4);
    const layover = 90;
    const leg2 = Math.round(baseDuration * 0.45);
    offers.push({
      id: `sky-${from}${to}-fallback-0`,
      origin: from,
      destination: to,
      departDate,
      returnDate,
      cabin,
      passengers,
      price: Math.round(basePrice * 1.1 * passengers),
      currency: 'USD',
      stops: 1,
      stopsLabel: '1 stop',
      durationMinutes: leg1 + layover + leg2,
      durationLabel: formatDuration(leg1 + layover + leg2),
      airlines: [airline.name],
      segments: [
        buildSegment({
          airline: regionOf(from) === 'caribbean' ? AIRLINES.B6 || airline : airline,
          origin: from,
          destination: hub,
          departAt,
          durationMin: leg1,
          flightNum: 200,
        }),
        buildSegment({
          airline,
          origin: hub,
          destination: to,
          departAt: addHours(departAt, (leg1 + layover) / 60),
          durationMin: leg2,
          flightNum: 201,
        }),
      ],
      comfortScore: 3.8,
      baggageIncluded: true,
      refundable: false,
      source: 'skyagent-catalog-v2',
      realisticNote: 'Fallback connection via major hub',
    });
  }

  return offers.sort((a, b) => a.price - b.price);
}

module.exports = {
  generateOffers,
  normalizeAirport,
  CITY_TO_AIRPORTS,
  hasNonstopMarket,
  carriersForNonstop,
};
