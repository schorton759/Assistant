/**
 * Plausible car-rental offers near airports / cities.
 */

const VENDORS = [
  { name: 'Enterprise', vibe: 'reliable' },
  { name: 'Hertz', vibe: 'network' },
  { name: 'Sixt', vibe: 'premium' },
  { name: 'Avis', vibe: 'business' },
  { name: 'Budget', vibe: 'value' },
];

const CATEGORIES = [
  { id: 'economy', name: 'Economy', example: 'Nissan Versa or similar', mult: 1 },
  { id: 'compact', name: 'Compact', example: 'Toyota Corolla or similar', mult: 1.15 },
  { id: 'suv', name: 'SUV', example: 'Toyota RAV4 or similar', mult: 1.55 },
  { id: 'minivan', name: 'Minivan', example: 'Chrysler Pacifica or similar', mult: 1.7 },
  { id: 'premium', name: 'Premium', example: 'BMW 5 Series or similar', mult: 2.2 },
];

const LOCATION_NAMES = {
  LHR: 'London Heathrow (LHR)',
  LGW: 'London Gatwick (LGW)',
  JFK: 'New York JFK',
  EWR: 'Newark (EWR)',
  BOS: 'Boston (BOS)',
  LAX: 'Los Angeles (LAX)',
  SFO: 'San Francisco (SFO)',
  CDG: 'Paris CDG',
  BDA: 'Bermuda L.F. Wade (BDA)',
  MIA: 'Miami (MIA)',
  ATL: 'Atlanta (ATL)',
  ORD: 'Chicago O’Hare (ORD)',
  NRT: 'Tokyo Narita (NRT)',
  DXB: 'Dubai (DXB)',
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

function daysBetween(a, b) {
  const ms = new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`);
  return Math.max(1, Math.round(ms / 86400000));
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function generateCarOffers({
  location,
  pickupDate,
  dropoffDate = null,
  drivers = 1,
  count = 8,
}) {
  const loc = String(location || '').toUpperCase().slice(0, 3);
  const pickup = pickupDate || new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  const dropoff = dropoffDate || addDays(pickup, 7);
  const nights = daysBetween(pickup, dropoff);
  const seed = hashString(`${loc}|${pickup}|${dropoff}|${drivers}|cars-v1`);
  const rand = seededRandom(seed);
  const baseDay = loc === 'BDA' || loc === 'DXB' ? 68 : loc.startsWith('L') ? 55 : 48;

  const offers = [];
  for (let i = 0; i < count; i += 1) {
    const vendor = VENDORS[i % VENDORS.length];
    const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
    const daily = Math.round(baseDay * category.mult * (0.9 + rand() * 0.35));
    const total = daily * nights;
    const seats = category.id === 'minivan' ? 7 : category.id === 'suv' ? 5 : 5;
    const bags = category.id === 'economy' ? 1 : category.id === 'compact' ? 2 : 3;

    offers.push({
      id: `car-${loc}-${seed.toString(16)}-${i}`,
      type: 'car',
      vendor: vendor.name,
      category: category.name,
      categoryId: category.id,
      example: category.example,
      locationCode: loc,
      location: LOCATION_NAMES[loc] || loc,
      pickupDate: pickup,
      dropoffDate: dropoff,
      days: nights,
      dailyPrice: daily,
      price: total,
      currency: 'USD',
      seats,
      bags,
      transmission: rand() > 0.25 ? 'Automatic' : 'Manual',
      unlimitedMileage: rand() > 0.3,
      drivers,
      source: 'skyagent-cars-v1',
    });
  }

  return offers.sort((a, b) => a.price - b.price);
}

module.exports = {
  generateCarOffers,
  LOCATION_NAMES,
  addDays,
};
