const fs = require('fs');
const os = require('os');
const path = require('path');

describe('trip watches', () => {
  let tripWatch;
  let tmpDir;

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyagent-watches-'));
    process.env.SKYAGENT_DATA_DIR = tmpDir;
    process.env.LIVE_FARES = '0';
    process.env.TEST_MODE = 'true';
    tripWatch = require('../tripWatch');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test('createWatch stores baseline and default target (~8% below)', () => {
    const watch = tripWatch.createWatch({
      deviceId: 'dev_test',
      origin: 'BDA',
      destination: 'LON',
      departDate: '2026-08-16',
      passengers: 5,
      ages: [40, 38, 10, 8, 5],
      baselinePrice: 2717,
      currency: 'USD',
    });

    expect(watch.origin).toBe('BDA');
    expect(watch.destination).toBe('LHR'); // city code normalized
    expect(watch.baselinePrice).toBe(2717);
    expect(watch.targetPrice).toBe(Math.round(2717 * 0.92));
    expect(watch.status).toBe('watching');
    expect(tripWatch.listWatches('dev_test')).toHaveLength(1);
  });

  test('duplicate route replaces prior watch for same device', () => {
    tripWatch.createWatch({
      deviceId: 'dev_test',
      origin: 'BDA',
      destination: 'LHR',
      departDate: '2026-08-16',
      passengers: 5,
      ages: [40, 38, 10, 8, 5],
      baselinePrice: 3000,
    });
    const second = tripWatch.createWatch({
      deviceId: 'dev_test',
      origin: 'BDA',
      destination: 'LHR',
      departDate: '2026-08-16',
      passengers: 5,
      ages: [40, 38, 10, 8, 5],
      baselinePrice: 2717,
      targetPrice: 2400,
    });
    const list = tripWatch.listWatches('dev_test');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(second.id);
    expect(list[0].targetPrice).toBe(2400);
  });

  test('checkWatch marks hit when price at or below target', async () => {
    const watch = tripWatch.createWatch({
      deviceId: 'dev_test',
      origin: 'JFK',
      destination: 'LHR',
      departDate: '2026-08-20',
      passengers: 1,
      ages: [30],
      baselinePrice: 900,
      targetPrice: 50000, // absurdly high so catalog always hits
    });

    const result = await tripWatch.checkWatch(watch.id, 'dev_test');
    expect(result.watch.status).toBe('hit');
    expect(result.alert?.type).toBe('price_hit');
    expect(result.watch.lastPrice).toBeLessThanOrEqual(50000);
    expect(result.probe.currentPrice).toBeGreaterThan(0);
  });

  test('deleteWatch removes only that device watch', () => {
    const a = tripWatch.createWatch({
      deviceId: 'dev_a',
      origin: 'JFK',
      destination: 'CDG',
      departDate: '2026-09-01',
      baselinePrice: 700,
    });
    tripWatch.createWatch({
      deviceId: 'dev_b',
      origin: 'JFK',
      destination: 'CDG',
      departDate: '2026-09-01',
      baselinePrice: 700,
    });
    expect(tripWatch.deleteWatch(a.id, 'dev_a')).toBe(true);
    expect(tripWatch.listWatches('dev_a')).toHaveLength(0);
    expect(tripWatch.listWatches('dev_b')).toHaveLength(1);
  });
});
