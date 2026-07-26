const fs = require('fs');
const os = require('os');
const path = require('path');

describe('trip dashboard plans', () => {
  let tripPlan;
  let tmpDir;

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyagent-plans-'));
    process.env.SKYAGENT_DATA_DIR = tmpDir;
    tripPlan = require('../tripPlan');
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test('createPlanFromSearch stores flight + extras with statuses', () => {
    const plan = tripPlan.createPlanFromSearch('dev1', {
      type: 'travel',
      brief: { origin: 'BDA', destination: 'LHR', departDate: '2026-08-16', passengers: 5 },
      flights: {
        brief: { origin: 'BDA', destination: 'LHR', departDate: '2026-08-16', passengers: 5, passengerSummary: '2 adults, 3 children' },
        recommendation: {
          id: 'f1', origin: 'BDA', destination: 'LHR', price: 2100, currency: 'USD',
          airlines: ['British Airways'], stopsLabel: 'Nonstop',
          bookingLinks: [{ url: 'https://example.com/f', primary: true }],
        },
      },
      hotels: {
        recommendation: {
          id: 'h1', type: 'hotel', name: 'Kensington Hotel', price: 1400, currency: 'USD',
          bookingLinks: [{ url: 'https://example.com/h' }],
        },
      },
      cars: {
        recommendation: {
          id: 'c1', type: 'car', vendor: 'Sixt', category: 'SUV', price: 600,
          bookingLinks: [{ url: 'https://example.com/c' }],
        },
      },
      transfers: {
        recommendation: {
          id: 't1', type: 'transfer', mode: 'Private van', price: 120,
          bookingLinks: [{ url: 'https://example.com/t' }],
        },
      },
    });

    expect(plan.active).toBe(true);
    expect(plan.components.flight.status).toBe('selected');
    expect(plan.components.hotel.status).toBe('selected');
    expect(plan.components.car.status).toBe('selected');
    expect(plan.components.transfer.status).toBe('selected');
    expect(plan.progress.total).toBe(4);
    expect(plan.progress.booked).toBe(0);
  });

  test('updatePlan marks component booked and updates progress', () => {
    const plan = tripPlan.createPlanFromSearch('dev1', {
      flights: {
        brief: { origin: 'JFK', destination: 'LHR', departDate: '2026-09-01', passengers: 1 },
        recommendation: { id: 'f1', origin: 'JFK', destination: 'LHR', price: 500, airlines: ['BA'] },
      },
    });
    expect(plan.components.hotel.status).toBe('skipped');

    const updated = tripPlan.updatePlan(plan.id, 'dev1', {
      component: 'flight',
      status: 'booked',
    });
    expect(updated.components.flight.status).toBe('booked');
    expect(updated.progress.booked).toBe(1);
    expect(updated.progress.pct).toBe(100);
    expect(updated.checklist.some((c) => c.done && c.label.includes('flight'))).toBe(true);
  });

  test('only one active plan per device', () => {
    tripPlan.createPlanFromSearch('dev1', {
      flights: {
        brief: { origin: 'BDA', destination: 'LHR', departDate: '2026-08-16' },
        recommendation: { id: 'a', price: 1, origin: 'BDA', destination: 'LHR' },
      },
    });
    const second = tripPlan.createPlanFromSearch('dev1', {
      flights: {
        brief: { origin: 'JFK', destination: 'CDG', departDate: '2026-10-01' },
        recommendation: { id: 'b', price: 2, origin: 'JFK', destination: 'CDG' },
      },
    });
    expect(tripPlan.getActivePlan('dev1').id).toBe(second.id);
    expect(tripPlan.listPlans('dev1').filter((p) => p.active)).toHaveLength(1);
  });
});

describe('smart local concierge', () => {
  test('names concrete price deltas', () => {
    process.env.TEST_MODE = 'true';
    process.env.LIVE_FARES = '0';
    const { buildSmartLocalConcierge } = require('../../agents/flightAgents');
    const best = [{
      id: 'best', price: 900, currency: 'USD', stops: 0, stopsLabel: 'Nonstop',
      durationLabel: '7h 00m', airlines: ['British Airways'],
    }];
    const cheapest = [{
      id: 'cheap', price: 700, currency: 'USD', stops: 1, stopsLabel: '1 stop in JFK',
      durationLabel: '11h 20m', airlines: ['JetBlue'],
    }];
    const out = buildSmartLocalConcierge({
      brief: { preference: 'best', passengers: 5, passengerSummary: '2 adults, 3 children', ages: [40, 38, 10, 8, 5] },
      best,
      cheapest,
      shortest: best,
      tradeoffs: [{ headline: 'Recommended is $200 more than the cheapest' }],
      preTrip: { tips: ['Reserve seats together'], layoverRisk: 'low' },
    });
    expect(out.recommendationId).toBe('best');
    expect(out.summary).toMatch(/British Airways/);
    expect(out.summary).toMatch(/200|\$200|USD 200/);
    expect(out.headline).toMatch(/Nonstop|900/);
    expect(out.model === undefined).toBe(true); // model attached by runner
  });
});
