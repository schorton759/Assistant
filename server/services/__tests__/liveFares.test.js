jest.mock('axios');

const axios = require('axios');
const {
  searchLiveOffers,
  cityCode,
  fareUnits,
  dedupeKeepCheapest,
  normalizeMarketOffer,
} = require('../liveFares');

describe('liveFares', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TEST_MODE = 'true';
    process.env.LIVE_FARES = '1';
    process.env.TRAVELPAYOUTS_TOKEN = 'test-token';
    delete process.env.DUFFEL_ACCESS_TOKEN;
  });

  test('cityCode maps airports to Travelpayouts city codes', () => {
    expect(cityCode('JFK')).toBe('NYC');
    expect(cityCode('LHR')).toBe('LON');
    expect(cityCode('BDA')).toBe('BDA');
  });

  test('fareUnits scales adult/child/infant', () => {
    expect(fareUnits([40, 8, 1])).toBeCloseTo(1.85);
  });

  test('normalizeMarketOffer builds a live SkyAgent offer', () => {
    const offer = normalizeMarketOffer({
      originAirport: 'JFK',
      destinationAirport: 'LGW',
      originCity: 'NYC',
      destinationCity: 'LON',
      departAt: '2026-08-20T18:20:00-04:00',
      airline: 'BA',
      flightNumber: '178',
      transfers: 0,
      durationMinutes: 420,
      adultPrice: 489,
      currency: 'usd',
      deepLink: 'https://www.aviasales.com/search/test',
      gate: 'Kiwi.com',
      provider: 'travelpayouts',
      ages: [40, 8],
      passengers: 2,
      cabin: 'economy',
      requestedDepartDate: '2026-08-20',
    });
    expect(offer.live).toBe(true);
    expect(offer.price).toBe(Math.round(489 * 1.75));
    expect(offer.stopsLabel).toBe('Nonstop');
    expect(offer.airlines[0]).toBe('British Airways');
    expect(offer.deepLink).toContain('aviasales');
  });

  test('dedupeKeepCheapest keeps lowest fare per itinerary fingerprint', () => {
    const offers = dedupeKeepCheapest([
      { origin: 'JFK', destination: 'LHR', departDate: '2026-08-20', returnDate: null, stops: 0, airlines: ['BA'], segments: [{ flightNumber: 'BA1' }], price: 500 },
      { origin: 'JFK', destination: 'LHR', departDate: '2026-08-20', returnDate: null, stops: 0, airlines: ['BA'], segments: [{ flightNumber: 'BA1' }], price: 420 },
      { origin: 'JFK', destination: 'LHR', departDate: '2026-08-20', returnDate: null, stops: 1, airlines: ['AF'], segments: [{ flightNumber: 'AF1' }], price: 390 },
    ]);
    expect(offers).toHaveLength(2);
    expect(offers[0].price).toBe(390);
    expect(offers.find((o) => o.airlines[0] === 'BA').price).toBe(420);
  });

  test('searchLiveOffers maps Travelpayouts prices_for_dates rows', async () => {
    axios.get.mockImplementation(async (url) => {
      if (String(url).includes('prices_for_dates')) {
        return {
          data: {
            success: true,
            currency: 'usd',
            data: [{
              origin_airport: 'JFK',
              destination_airport: 'LGW',
              origin: 'NYC',
              destination: 'LON',
              departure_at: '2026-08-20T18:20:00-04:00',
              airline: 'BA',
              flight_number: '178',
              transfers: 0,
              duration_to: 420,
              price: 399,
              gate: 'Kiwi.com',
              link: '/search/NYC2008LON1?t=demo',
            }],
          },
        };
      }
      return { data: { success: true, data: {} } };
    });

    const result = await searchLiveOffers({
      origin: 'JFK',
      destination: 'LHR',
      departDate: '2026-08-20',
      passengers: 1,
      ages: [30],
    });

    expect(result.live).toBe(true);
    expect(result.providers).toContain('travelpayouts');
    expect(result.offers[0].price).toBe(399);
    expect(result.offers[0].live).toBe(true);
    expect(result.offers[0].deepLink).toContain('aviasales.com');
  });

  test('searchLiveOffers is disabled under TEST_MODE without LIVE_FARES=1', async () => {
    process.env.LIVE_FARES = '0';
    const result = await searchLiveOffers({
      origin: 'JFK',
      destination: 'LHR',
      departDate: '2026-08-20',
    });
    expect(result.disabled).toBe(true);
    expect(result.offers).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
