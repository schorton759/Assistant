/**
 * Car rental agents — parallel to the flight desk.
 */

const logger = require('../utils/logger');
const { MODELS, hasNvidiaKey, generateJson } = require('../services/aiService');
const { generateCarOffers, addDays } = require('../services/carCatalog');
const { normalizeAirport } = require('../services/flightCatalog');
const { buildCarBookingLinks } = require('../services/bookingLinks');

function wantsCars(text = '') {
  return /\b(car|cars|rental|rent\s+a\s+car|hire\s+a\s+car|vehicle|suv|minivan)\b/i.test(text);
}

function wantsFlights(text = '') {
  if (!text) return true;
  if (wantsCars(text) && !/\b(flight|flights|fly|plane|airline|airport)\b/i.test(text)) {
    return false;
  }
  return true;
}

function isoSoon(days = 21) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function carBriefFromText(message, form = {}) {
  const text = String(message || '');
  const fromTo = text.match(/from\s+([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+?)(?:\s|$|,|\.)/i);
  const destination =
    normalizeAirport(form.location) ||
    normalizeAirport(form.destination) ||
    (fromTo ? normalizeAirport(fromTo[2]) : null) ||
    (/\blondon\b/i.test(text) ? 'LHR' : null) ||
    (/\bparis\b/i.test(text) ? 'CDG' : null) ||
    (/\bbermuda\b/i.test(text) ? 'BDA' : null) ||
    'LHR';

  const isoDates = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  let pickupDate = form.pickupDate || form.departDate || isoDates[0] || isoSoon(21);
  let dropoffDate = form.dropoffDate || form.returnDate || isoDates[1] || null;
  if (!dropoffDate) dropoffDate = addDays(pickupDate, 7);

  const drivers = Number(form.drivers || form.passengers) || 1;
  const preference = /cheap|budget/i.test(text)
    ? 'cheapest'
    : /suv|family|minivan|premium|best/i.test(text)
      ? 'best'
      : 'best';

  return {
    location: destination,
    pickupDate,
    dropoffDate,
    drivers,
    preference,
    notes: text.slice(0, 240),
  };
}

function summarizeCar(offer) {
  return {
    id: offer.id,
    vendor: offer.vendor,
    category: offer.category,
    price: offer.price,
    dailyPrice: offer.dailyPrice,
    location: offer.location,
    pickupDate: offer.pickupDate,
    dropoffDate: offer.dropoffDate,
    seats: offer.seats,
    transmission: offer.transmission,
  };
}

function rankCars(offers, preference = 'best') {
  if (preference === 'cheapest') {
    return [...offers].sort((a, b) => a.price - b.price).slice(0, 5);
  }
  return [...offers]
    .map((o) => {
      const comfort = o.categoryId === 'premium' ? 1 : o.categoryId === 'suv' || o.categoryId === 'minivan' ? 0.7 : 0.4;
      const value = 1 - o.price / (offers[offers.length - 1].price || o.price);
      return { ...o, bestScore: Number((value * 0.65 + comfort * 0.35).toFixed(3)) };
    })
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, 5);
}

async function runCarConcierge(brief, offers) {
  const top = offers.slice(0, 3).map(summarizeCar);
  const fallback = {
    headline: 'Car desk recommendation',
    recommendationId: top[0]?.id || null,
    summary: `Best overall pickup at ${brief.location} from ${brief.pickupDate} to ${brief.dropoffDate}.`,
    tips: [
      'Airport counters can have queues — premium vendors are often faster.',
      'Check if your credit card covers CDW before buying extra insurance.',
      'For families, SUV or minivan saves the luggage tetris.',
    ],
  };

  if (!hasNvidiaKey()) {
    return { agent: 'CarConcierge', model: 'local-fallback', ...fallback, reasoning: 'Local car ranking.' };
  }

  try {
    const { data, model } = await generateJson({
      model: MODELS.concierge,
      system: 'You are CarConcierge for SkyAgent. Recommend one rental from the provided offers only.',
      user: `Brief: ${JSON.stringify(brief)}\nOffers: ${JSON.stringify(top)}\nReturn JSON: {"headline":"","recommendationId":"","summary":"","tips":["","",""]}`,
      maxTokens: 500,
    });
    return {
      agent: 'CarConcierge',
      model,
      headline: data.headline || fallback.headline,
      recommendationId: data.recommendationId || fallback.recommendationId,
      summary: data.summary || fallback.summary,
      tips: Array.isArray(data.tips) ? data.tips.slice(0, 4) : fallback.tips,
      reasoning: 'NVIDIA CarConcierge synthesized options.',
    };
  } catch (error) {
    logger.warn('CarConcierge falling back:', error.message);
    return { agent: 'CarConcierge', model: 'local-fallback', ...fallback, reasoning: error.message };
  }
}

async function searchCars(input = {}) {
  const message = input.query || input.message || '';
  const brief = carBriefFromText(message, input);
  const offers = generateCarOffers({
    location: brief.location,
    pickupDate: brief.pickupDate,
    dropoffDate: brief.dropoffDate,
    drivers: brief.drivers,
  }).map((o) => ({
    ...o,
    bookingLinks: buildCarBookingLinks(o),
  }));

  const ranked = rankCars(offers, brief.preference);
  const concierge = await runCarConcierge(brief, ranked);
  const recommendation =
    offers.find((o) => o.id === concierge.recommendationId) || ranked[0] || offers[0];

  return {
    status: 'ok',
    type: 'cars',
    brief,
    nvidiaEnabled: hasNvidiaKey(),
    recommendation,
    offers: ranked,
    agents: [concierge],
    offerCount: offers.length,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  wantsCars,
  wantsFlights,
  searchCars,
  carBriefFromText,
};
