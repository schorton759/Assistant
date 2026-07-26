/**
 * Airport transfers (taxi / private / shared) for arrival city.
 */

const crypto = require('crypto');

const TRANSFERS = {
  LHR: [
    { mode: 'Private van', vendor: 'Blacklane', minutes: 55, base: 120, seats: 6 },
    { mode: 'Shared shuttle', vendor: 'Hotelink', minutes: 75, base: 35, seats: 8 },
    { mode: 'Black cab', vendor: 'London Taxi', minutes: 60, base: 95, seats: 5 },
  ],
  LGW: [
    { mode: 'Private car', vendor: 'Holiday Extras', minutes: 70, base: 110, seats: 4 },
    { mode: 'Train + tube', vendor: 'Gatwick Express', minutes: 50, base: 28, seats: 99 },
  ],
  CDG: [
    { mode: 'Private van', vendor: 'Welcome Pickups', minutes: 50, base: 95, seats: 6 },
    { mode: 'RER + Metro', vendor: 'RATP', minutes: 55, base: 14, seats: 99 },
  ],
  JFK: [
    { mode: 'Private SUV', vendor: 'Carmel', minutes: 55, base: 105, seats: 5 },
    { mode: 'AirTrain + subway', vendor: 'MTA', minutes: 70, base: 11, seats: 99 },
  ],
  DEFAULT: [
    { mode: 'Private car', vendor: 'Local transfer', minutes: 40, base: 70, seats: 4 },
    { mode: 'Shared shuttle', vendor: 'Airport shuttle', minutes: 55, base: 30, seats: 8 },
  ],
};

function generateTransferOffers({
  location = 'LHR',
  date,
  passengers = 2,
  direction = 'arrival',
}) {
  const pool = TRANSFERS[location] || TRANSFERS.DEFAULT;
  const pax = Math.max(1, Number(passengers) || 1);
  return pool.map((t, i) => {
    const price = Math.round(t.base * (pax > 4 && t.seats < 99 ? 1.25 : 1) * (0.95 + i * 0.04));
    const id = `xfer-${crypto.createHash('sha1').update(`${t.vendor}|${location}|${date}|${direction}|${pax}`).digest('hex').slice(0, 10)}`;
    return {
      id,
      type: 'transfer',
      mode: t.mode,
      vendor: t.vendor,
      location,
      date: date || null,
      direction,
      passengers: pax,
      seats: t.seats,
      durationMinutes: t.minutes,
      durationLabel: `${t.minutes}m`,
      price,
      currency: 'USD',
      source: 'skyagent-transfers-v1',
      bookingLinks: [
        {
          id: 'google',
          label: 'Google transfer search',
          blurb: 'Find airport transfers with your dates',
          primary: true,
          url: `https://www.google.com/search?q=${encodeURIComponent(`${location} airport ${t.mode} transfer for ${pax}`)}`,
        },
      ],
    };
  }).filter((t) => t.seats >= Math.min(pax, 8) || t.seats === 99)
    .sort((a, b) => a.price - b.price);
}

module.exports = {
  generateTransferOffers,
  TRANSFERS,
};
