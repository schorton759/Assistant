const {
  buildPreTripOps,
  buildTradeoffs,
} = require('../preTripOps');
const { generateHotelOffers } = require('../hotelCatalog');
const { generateTransferOffers } = require('../transferCatalog');
const {
  createSharedTrip,
  getSharedTrip,
  buildTripIcs,
  parseBookingConfirmation,
} = require('../sharedTrip');
const {
  wantsHotels,
  wantsTransfers,
  wantsWholeTrip,
  searchHotels,
} = require('../../agents/tripExtras');
const { localIntentParse } = require('../../agents/flightAgents');

describe('whole-trip extras + ops', () => {
  test('detects hotel / transfer / whole-trip intent', () => {
    expect(wantsHotels('need a hotel near Heathrow')).toBe(true);
    expect(wantsTransfers('airport transfer for 5')).toBe(true);
    expect(wantsWholeTrip('plan my whole trip with hotel and transfer')).toBe(true);
  });

  test('hotel catalog returns bookable stays', () => {
    const offers = generateHotelOffers({
      location: 'LHR',
      checkIn: '2026-08-16',
      checkOut: '2026-08-23',
      rooms: 2,
      guests: 5,
      family: true,
    });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].bookingLinks[0].url).toMatch(/^https:\/\//);
    expect(offers[0].nights).toBe(7);
  });

  test('transfer catalog sizes for party', () => {
    const offers = generateTransferOffers({ location: 'LHR', date: '2026-08-16', passengers: 5 });
    expect(offers.some((o) => o.seats >= 5 || o.seats === 99)).toBe(true);
  });

  test('pre-trip ops and tradeoffs', () => {
    const rec = {
      id: 'a', price: 900, stops: 0, stopsLabel: 'Nonstop', durationMinutes: 420,
      airlines: ['British Airways'], baggageIncluded: true,
      segments: [{ departAt: '2026-08-16T17:00:00Z' }],
    };
    const cheap = {
      id: 'b', price: 700, stops: 1, stopsLabel: '1 stop in JFK', durationMinutes: 700,
      airlines: ['JetBlue'], segments: [{}, { layoverMinutes: 90 }],
    };
    const ops = buildPreTripOps({ brief: { origin: 'BDA', destination: 'LHR', passengers: 5, ages: [40, 38, 10, 8, 5] }, recommendation: rec });
    expect(ops.tips.length).toBeGreaterThan(3);
    expect(ops.layoverRisk).toBe('low');
    const tradeoffs = buildTradeoffs({ recommendation: rec, cheapest: cheap, shortest: rec });
    expect(tradeoffs.some((t) => t.id === 'price_vs_pick')).toBe(true);
  });

  test('follow-up same trip day earlier uses lastTrip', () => {
    const brief = localIntentParse('same trip but leave a day earlier', {
      lastTrip: {
        origin: 'BDA',
        destination: 'LHR',
        departDate: '2026-08-16',
        returnDate: '2026-08-23',
        passengers: 5,
      },
    });
    expect(brief.origin).toBe('BDA');
    expect(brief.destination).toBe('LHR');
    expect(brief.departDate).toBe('2026-08-15');
    expect(brief.returnDate).toBe('2026-08-22');
  });

  test('shared trip + ics + postbook parse', async () => {
    const hotels = await searchHotels({
      location: 'LHR',
      departDate: '2026-08-16',
      returnDate: '2026-08-23',
      passengers: 5,
      ages: [40, 38, 10, 8, 5],
    });
    const shared = createSharedTrip({
      brief: { origin: 'BDA', destination: 'LHR', departDate: '2026-08-16', passengers: 5 },
      recommendation: {
        origin: 'BDA', destination: 'LHR', price: 2100, currency: 'USD',
        airlines: ['British Airways'], stopsLabel: 'Nonstop', durationLabel: '7h 00m',
        segments: [{ departAt: '2026-08-16T17:00:00Z', arriveAt: '2026-08-16T24:00:00Z', origin: 'BDA', destination: 'LHR' }],
        bookingLinks: [{ label: 'Book', url: 'https://example.com', primary: true }],
      },
      hotels,
      preTrip: { tips: ['Pack layers'] },
    });
    expect(getSharedTrip(shared.id).id).toBe(shared.id);
    expect(buildTripIcs(shared)).toMatch(/BEGIN:VCALENDAR/);

    const post = parseBookingConfirmation('Confirmation ABC123 BA 178 BDA to LHR on 2026-08-16');
    expect(post.parsed.pnr).toBeTruthy();
    expect(post.ics).toMatch(/BEGIN:VCALENDAR/);
    expect(post.reminders.length).toBeGreaterThan(0);
  });
});
