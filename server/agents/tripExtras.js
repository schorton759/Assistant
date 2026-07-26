/**
 * Whole-trip extras: hotels + airport transfers.
 */

const { generateHotelOffers, addDays } = require('../services/hotelCatalog');
const { generateTransferOffers } = require('../services/transferCatalog');
const { normalizeAirport } = require('../services/flightCatalog');

function wantsHotels(text = '') {
  return /\b(hotel|hotels|stay|stays|room|rooms|accommodation|lodging|airbnb)\b/i.test(text);
}

function wantsTransfers(text = '') {
  return /\b(transfer|transfers|taxi|shuttle|private\s+car|airport\s+pickup|pickup\s+at\s+airport)\b/i.test(text);
}

function wantsWholeTrip(text = '') {
  return /\b(whole\s+trip|full\s+trip|itinerary|plan\s+(my|the)\s+trip|trip\s+plan|everything|package)\b/i.test(text)
    || (wantsHotels(text) && wantsTransfers(text));
}

function roomCountFromPassengers(passengers = 1, ages = []) {
  const pax = Math.max(1, Number(passengers) || 1);
  const infants = (ages || []).filter((a) => Number(a) < 2).length;
  const paying = Math.max(1, pax - infants);
  return Math.max(1, Math.ceil(paying / 2));
}

function buildStayWindow(brief = {}) {
  const checkIn = brief.departDate || brief.pickupDate || addDays(new Date().toISOString().slice(0, 10), 21);
  const checkOut = brief.returnDate || brief.dropoffDate || addDays(checkIn, 7);
  return { checkIn, checkOut };
}

async function searchHotels(input = {}) {
  const location = normalizeAirport(input.location || input.destination) || 'LHR';
  const { checkIn, checkOut } = buildStayWindow(input);
  const guests = Number(input.passengers || input.guests) || 2;
  const ages = Array.isArray(input.ages) ? input.ages : [];
  const rooms = Number(input.rooms) || roomCountFromPassengers(guests, ages);
  const offers = generateHotelOffers({
    location,
    checkIn,
    checkOut,
    rooms,
    guests,
    family: guests > 1 || ages.some((a) => a < 12),
  });
  const recommendation = offers.find((o) => o.familyFriendly) || offers[0];
  return {
    status: 'ok',
    type: 'hotels',
    brief: { location, checkIn, checkOut, rooms, guests },
    recommendation,
    offers: offers.slice(0, 6),
    agents: [{
      agent: 'HotelDesk',
      model: 'local-catalog',
      headline: recommendation ? `${recommendation.name} · ${recommendation.area}` : 'Hotel options',
      summary: recommendation
        ? `${recommendation.rooms} room(s) · ${recommendation.nights} nights · $${recommendation.price} total near ${location}.`
        : 'No hotels found',
      reasoning: 'Catalog hotels with Booking.com / Google Hotels deep links.',
    }],
  };
}

async function searchTransfers(input = {}) {
  const location = normalizeAirport(input.location || input.destination) || 'LHR';
  const date = input.departDate || input.pickupDate || null;
  const passengers = Number(input.passengers) || 2;
  const offers = generateTransferOffers({ location, date, passengers, direction: 'arrival' });
  const recommendation = offers.find((o) => o.seats >= passengers && o.seats < 99) || offers[0];
  return {
    status: 'ok',
    type: 'transfers',
    brief: { location, date, passengers },
    recommendation,
    offers: offers.slice(0, 5),
    agents: [{
      agent: 'TransferDesk',
      model: 'local-catalog',
      headline: recommendation ? `${recommendation.mode} · ${recommendation.vendor}` : 'Transfers',
      summary: recommendation
        ? `$${recommendation.price} · ${recommendation.durationLabel} · seats ${recommendation.seats === 99 ? 'shared' : recommendation.seats}`
        : 'No transfers found',
      reasoning: 'Airport transfer options sized for your party.',
    }],
  };
}

module.exports = {
  wantsHotels,
  wantsTransfers,
  wantsWholeTrip,
  searchHotels,
  searchTransfers,
  roomCountFromPassengers,
};
