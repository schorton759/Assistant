/**
 * Deterministic hotel offers near destination airports/cities.
 * Catalog-shaped like cars — enough for whole-trip planning demos + booking deep links.
 */

const crypto = require('crypto');

const HOTELS = {
  LHR: [
    { name: 'Premier Inn London Heathrow', area: 'Heathrow', stars: 3, nightly: 145, family: true },
    { name: 'Hilton London Heathrow Airport', area: 'Terminal 4', stars: 4, nightly: 220, family: true },
    { name: 'The Kensington Hotel', area: 'South Kensington', stars: 5, nightly: 380, family: true },
    { name: 'Travelodge London Central', area: 'Covent Garden edge', stars: 2, nightly: 110, family: false },
  ],
  LGW: [
    { name: 'Sofitel London Gatwick', area: 'South Terminal', stars: 4, nightly: 195, family: true },
    { name: 'Premier Inn Gatwick', area: 'North Terminal', stars: 3, nightly: 130, family: true },
  ],
  CDG: [
    { name: 'Ibis Paris CDG', area: 'Airport', stars: 3, nightly: 125, family: true },
    { name: 'Hôtel Plaza Athénée', area: 'Avenue Montaigne', stars: 5, nightly: 620, family: false },
    { name: 'CitizenM Paris Gare de Lyon', area: 'Gare de Lyon', stars: 4, nightly: 190, family: true },
  ],
  JFK: [
    { name: 'TWA Hotel', area: 'JFK T5', stars: 4, nightly: 289, family: true },
    { name: 'Courtyard JFK', area: 'Airport', stars: 3, nightly: 210, family: true },
  ],
  BDA: [
    { name: 'Hamilton Princess', area: 'Hamilton', stars: 5, nightly: 520, family: true },
    { name: 'Grotto Bay Beach Resort', area: 'Hamilton Parish', stars: 3, nightly: 280, family: true },
  ],
  DEFAULT: [
    { name: 'City Centre Inn', area: 'Downtown', stars: 3, nightly: 160, family: true },
    { name: 'Airport Gateway Hotel', area: 'Airport', stars: 3, nightly: 140, family: true },
    { name: 'Boutique Stay', area: 'Historic centre', stars: 4, nightly: 240, family: false },
  ],
};

function nightsBetween(checkIn, checkOut) {
  const a = new Date(`${checkIn}T12:00:00Z`).getTime();
  const b = new Date(`${checkOut}T12:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86400000));
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function generateHotelOffers({
  location = 'LHR',
  checkIn,
  checkOut,
  rooms = 1,
  guests = 2,
  family = false,
}) {
  const inDate = checkIn || addDays(new Date().toISOString().slice(0, 10), 21);
  const outDate = checkOut || addDays(inDate, 7);
  const nights = nightsBetween(inDate, outDate);
  const pool = HOTELS[location] || HOTELS.DEFAULT;
  const roomCount = Math.max(1, Number(rooms) || Math.ceil(guests / 2));

  return pool.map((h, i) => {
    let nightly = h.nightly * (0.92 + (i * 0.03));
    if (family && h.family) nightly *= 0.97;
    if (!h.family && family) nightly *= 1.08;
    const total = Math.round(nightly * nights * roomCount);
    const id = `hotel-${crypto.createHash('sha1').update(`${h.name}|${location}|${inDate}|${outDate}|${roomCount}`).digest('hex').slice(0, 10)}`;
    return {
      id,
      type: 'hotel',
      name: h.name,
      area: h.area,
      location,
      stars: h.stars,
      familyFriendly: h.family,
      checkIn: inDate,
      checkOut: outDate,
      nights,
      rooms: roomCount,
      guests,
      nightlyPrice: Math.round(nightly),
      price: total,
      currency: 'USD',
      source: 'skyagent-hotels-v1',
      bookingLinks: [
        {
          id: 'booking',
          label: 'Booking.com',
          blurb: 'Search this hotel with dates filled in',
          primary: true,
          url: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${h.name} ${location}`)}&checkin=${inDate}&checkout=${outDate}&group_adults=${Math.max(1, guests)}&no_rooms=${roomCount}`,
        },
        {
          id: 'google-hotels',
          label: 'Google Hotels',
          blurb: 'Compare nearby stays',
          primary: false,
          url: `https://www.google.com/travel/hotels?q=${encodeURIComponent(`${h.name} ${location} ${inDate} to ${outDate}`)}`,
        },
      ],
    };
  }).sort((a, b) => a.price - b.price);
}

module.exports = {
  generateHotelOffers,
  addDays,
  nightsBetween,
  HOTELS,
};
