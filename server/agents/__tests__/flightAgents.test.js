const {
  localIntentParse,
  rankCheapest,
  rankShortest,
  rankBest,
  searchFlights,
} = require('../flightAgents');
const { generateOffers } = require('../../services/flightCatalog');

describe('SkyAgent flight agents', () => {
  test('localIntentParse extracts from/to and preference', () => {
    const brief = localIntentParse('Find the cheapest flight from SFO to Tokyo next month');
    expect(brief.origin).toBe('SFO');
    expect(brief.destination).toBe('NRT');
    expect(brief.preference).toBe('cheapest');
  });

  test('generateOffers returns ranked variety', () => {
    const offers = generateOffers({
      origin: 'JFK',
      destination: 'LHR',
      departDate: '2026-08-20',
      passengers: 1,
    });
    expect(offers.length).toBeGreaterThanOrEqual(8);
    expect(offers.some((o) => o.stops === 0)).toBe(true);
    expect(offers.every((o) => o.price > 0)).toBe(true);
  });

  test('rankers prioritize the right dimension', () => {
    const offers = generateOffers({
      origin: 'LAX',
      destination: 'NRT',
      departDate: '2026-09-01',
    });
    const cheapest = rankCheapest(offers);
    const shortest = rankShortest(offers);
    const best = rankBest(offers);

    expect(cheapest[0].price).toBeLessThanOrEqual(cheapest[1].price);
    expect(shortest[0].durationMinutes).toBeLessThanOrEqual(shortest[1].durationMinutes);
    expect(best[0].bestScore).toBeGreaterThanOrEqual(best[1].bestScore);
  });

  test('searchFlights returns agent desk and buckets without NVIDIA', async () => {
    delete process.env.NVIDIA_API_KEY;
    const result = await searchFlights({
      origin: 'JFK',
      destination: 'CDG',
      departDate: '2026-10-10',
      preference: 'best',
    });

    expect(result.nvidiaEnabled).toBe(false);
    expect(result.buckets.cheapest.length).toBeGreaterThan(0);
    expect(result.buckets.shortest.length).toBeGreaterThan(0);
    expect(result.buckets.best.length).toBeGreaterThan(0);
    expect(result.recommendation).toBeTruthy();
    expect(result.agents.map((a) => a.agent)).toEqual(
      expect.arrayContaining([
        'IntentAgent',
        'PriceHunter',
        'TimeOptimizer',
        'RouteAdvisor',
        'Concierge',
      ])
    );
  });

  test('Bermuda to London never invents Gulf/Asia nonstops', () => {
    const offers = generateOffers({
      origin: 'BDA',
      destination: 'LHR',
      departDate: '2026-08-16',
    });
    expect(offers.length).toBeGreaterThan(0);
    for (const offer of offers) {
      if (offer.stops === 0) {
        expect(offer.airlines).toEqual(['British Airways']);
        expect(offer.segments[0].origin).toBe('BDA');
        expect(offer.segments[0].destination).toBe('LHR');
      }
      expect(offer.segments.every((s) => !['DOH', 'DXB', 'SIN', 'NRT'].includes(s.origin))).toBe(true);
      expect(offer.segments.every((s) => !['DOH', 'DXB', 'SIN', 'NRT'].includes(s.destination))).toBe(true);
      if (offer.stops === 0) {
        expect(['Qatar Airways', 'Emirates', 'Frontier', 'Spirit', 'Japan Airlines']).not.toContain(offer.airlines[0]);
      }
    }
  });

  test('localIntentParse reads month names into upcoming dates', () => {
    const brief = localIntentParse('best flight from Bermuda to London August 16');
    expect(brief.origin).toBe('BDA');
    expect(brief.destination).toBe('LHR');
    expect(brief.departDate >= new Date().toISOString().slice(0, 10)).toBe(true);
    expect(brief.departDate.slice(5)).toBe('08-16');
  });

  test('family without count asks for passenger clarification', async () => {
    delete process.env.NVIDIA_API_KEY;
    const result = await searchFlights({
      query: 'best flight from Bermuda to London for my family on August 16',
    });
    expect(result.status).toBe('needs_clarification');
    expect(result.clarification.type).toBe('passenger_count');
    expect(result.offerCount).toBe(0);
  });

  test('remembered family size skips clarification', async () => {
    delete process.env.NVIDIA_API_KEY;
    const result = await searchFlights({
      query: 'best flight from Bermuda to London for my family on August 16',
      passengers: 4,
    });
    expect(result.status).toBe('ok');
    expect(result.brief.passengers).toBe(4);
    expect(result.buckets.best[0].stopsLabel).toMatch(/Nonstop|stop in|stops via/);
  });

  test('one-stop offers name the layover airport', () => {
    const offers = generateOffers({
      origin: 'BDA',
      destination: 'LHR',
      departDate: '2026-08-16',
    });
    const oneStop = offers.find((o) => o.stops === 1);
    expect(oneStop).toBeTruthy();
    expect(oneStop.stopsLabel).toMatch(/^1 stop in [A-Z]{3}$/);
    expect(oneStop.stopAirports).toHaveLength(1);
    expect(oneStop.segments[1].layoverLabel).toBeTruthy();
  });
});
