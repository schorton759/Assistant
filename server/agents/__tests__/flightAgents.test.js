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
});
