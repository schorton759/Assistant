/**
 * SkyAgent — multi-agent flight concierge powered by free NVIDIA NIM models.
 *
 * Agents:
 *  1. IntentAgent   — parse natural language into a structured trip brief
 *  2. PriceHunter   — pick cheapest options + explain tradeoffs
 *  3. TimeOptimizer — pick shortest total travel time
 *  4. RouteAdvisor  — best overall (price × time × comfort × stops)
 *  5. Concierge     — synthesize a travel-agent recommendation
 */

const logger = require('../utils/logger');
const { MODELS, hasNvidiaKey, generateJson } = require('../services/aiService');
const { generateOffers, normalizeAirport } = require('../services/flightCatalog');

function summarizeOffer(offer) {
  return {
    id: offer.id,
    price: offer.price,
    currency: offer.currency,
    stops: offer.stops,
    durationMinutes: offer.durationMinutes,
    durationLabel: offer.durationLabel,
    airlines: offer.airlines,
    comfortScore: offer.comfortScore,
    baggageIncluded: offer.baggageIncluded,
    path: offer.segments.map((s) => `${s.origin}→${s.destination}`).join(' · '),
    departAt: offer.segments[0]?.departAt,
  };
}

function localIntentParse(message, fallback = {}) {
  const text = String(message || '');
  const upper = text.toUpperCase();
  const airportMatches = upper.match(/\b[A-Z]{3}\b/g) || [];
  const known = new Set([
    'JFK', 'EWR', 'LGA', 'LAX', 'SFO', 'SEA', 'ORD', 'ATL', 'MIA', 'BOS',
    'LHR', 'CDG', 'FRA', 'AMS', 'DXB', 'NRT', 'HND', 'ICN', 'SIN', 'SYD', 'BKK',
  ]);
  const codes = airportMatches.filter((c) => known.has(c));

  let origin = fallback.origin || codes[0] || null;
  let destination = fallback.destination || codes[1] || null;

  const fromTo = text.match(/from\s+([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+?)(?:\s|$|,|\.|on|next|under)/i);
  if (fromTo) {
    origin = normalizeAirport(fromTo[1]) || origin;
    destination = normalizeAirport(fromTo[2]) || destination;
  }

  const toFrom = text.match(/to\s+([A-Za-z\s]+?)\s+from\s+([A-Za-z\s]+?)(?:\s|$|,|\.|on|next|under)/i);
  if (toFrom) {
    destination = normalizeAirport(toFrom[1]) || destination;
    origin = normalizeAirport(toFrom[2]) || origin;
  }

  const preference = /cheap|budget|lowest|affordable/i.test(text)
    ? 'cheapest'
    : /short|fast|quick|nonstop|direct/i.test(text)
      ? 'shortest'
      : /best|comfort|balanced|recommend/i.test(text)
        ? 'best'
        : fallback.preference || 'best';

  const today = new Date();
  const defaultDepart = new Date(today.getTime() + 21 * 86400000);
  const departDate =
    fallback.departDate ||
    defaultDepart.toISOString().slice(0, 10);

  let returnDate = fallback.returnDate || null;
  if (/round\s*trip|return|weekend/i.test(text) && !returnDate) {
    const ret = new Date(defaultDepart.getTime() + 7 * 86400000);
    returnDate = ret.toISOString().slice(0, 10);
  }

  return {
    origin,
    destination,
    departDate,
    returnDate,
    passengers: fallback.passengers || 1,
    cabin: fallback.cabin || 'economy',
    preference,
    notes: text.slice(0, 240),
  };
}

async function runIntentAgent({ message, form }) {
  const fallback = localIntentParse(message, form);
  if (!hasNvidiaKey() || !message) {
    return {
      agent: 'IntentAgent',
      model: 'local-fallback',
      brief: fallback,
      reasoning: 'Parsed trip details locally (NVIDIA key missing or no free-text query).',
    };
  }

  try {
    const { data, model } = await generateJson({
      model: MODELS.intent,
      system:
        'You are IntentAgent for SkyAgent, a 21st-century travel AI. Extract flight search intent. Use IATA airport codes when possible.',
      user: `User message: ${message}
Known form fields (may be empty): ${JSON.stringify(form || {})}
Return JSON:
{
  "origin": "IATA or city",
  "destination": "IATA or city",
  "departDate": "YYYY-MM-DD",
  "returnDate": "YYYY-MM-DD or null",
  "passengers": 1,
  "cabin": "economy|premium|business",
  "preference": "cheapest|shortest|best",
  "notes": "short note"
}`,
      maxTokens: 400,
    });

    const brief = {
      origin: normalizeAirport(data.origin) || fallback.origin,
      destination: normalizeAirport(data.destination) || fallback.destination,
      departDate: data.departDate || fallback.departDate,
      returnDate: data.returnDate || fallback.returnDate,
      passengers: Number(data.passengers) || fallback.passengers,
      cabin: data.cabin || fallback.cabin,
      preference: data.preference || fallback.preference,
      notes: data.notes || fallback.notes,
    };

    return {
      agent: 'IntentAgent',
      model,
      brief,
      reasoning: 'Parsed natural-language trip intent via NVIDIA NIM.',
    };
  } catch (error) {
    logger.warn('IntentAgent falling back:', error.message);
    return {
      agent: 'IntentAgent',
      model: 'local-fallback',
      brief: fallback,
      reasoning: `NVIDIA intent parse failed (${error.message}); used local parser.`,
    };
  }
}

function rankCheapest(offers) {
  return [...offers].sort((a, b) => a.price - b.price).slice(0, 5);
}

function rankShortest(offers) {
  return [...offers]
    .sort((a, b) => a.durationMinutes - b.durationMinutes || a.price - b.price)
    .slice(0, 5);
}

function rankBest(offers) {
  // Composite: lower price, shorter time, fewer stops, higher comfort
  const prices = offers.map((o) => o.price);
  const durations = offers.map((o) => o.durationMinutes);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices) || 1;
  const minD = Math.min(...durations);
  const maxD = Math.max(...durations) || 1;

  return [...offers]
    .map((o) => {
      const priceNorm = (o.price - minP) / (maxP - minP || 1);
      const timeNorm = (o.durationMinutes - minD) / (maxD - minD || 1);
      const stopPenalty = o.stops * 0.12;
      const comfortBonus = (o.comfortScore || 3) / 5;
      const baggageBonus = o.baggageIncluded ? 0.05 : 0;
      const score = 1 - (priceNorm * 0.4 + timeNorm * 0.35 + stopPenalty) + comfortBonus * 0.2 + baggageBonus;
      return { ...o, bestScore: Number(score.toFixed(3)) };
    })
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, 5);
}

async function runSpecialistAgent({ name, modelRole, focus, offers }) {
  const top = offers.slice(0, 5).map(summarizeOffer);
  const localReason =
    name === 'PriceHunter'
      ? `Lowest fare ${top[0]?.currency} ${top[0]?.price} on ${top[0]?.airlines?.join('/')}.`
      : name === 'TimeOptimizer'
        ? `Fastest itinerary ${top[0]?.durationLabel} with ${top[0]?.stops} stops.`
        : `Best composite score balances price, time, comfort, and stops.`;

  if (!hasNvidiaKey()) {
    return {
      agent: name,
      model: 'local-fallback',
      picks: top,
      reasoning: localReason,
    };
  }

  try {
    const { data, model } = await generateJson({
      model: MODELS[modelRole] || MODELS.specialist,
      system: `You are ${name}, a specialist AI travel agent. Focus: ${focus}. Be concise and practical.`,
      user: `Evaluate these flight offers and return JSON:
{
  "pickIds": ["id1","id2","id3"],
  "reasoning": "2-3 sentences explaining the top picks and tradeoffs"
}
Offers:
${JSON.stringify(top, null, 2)}`,
      maxTokens: 500,
      temperature: 0.25,
    });

    const idSet = new Set(data.pickIds || []);
    const reordered = [
      ...offers.filter((o) => idSet.has(o.id)),
      ...offers.filter((o) => !idSet.has(o.id)),
    ]
      .slice(0, 5)
      .map(summarizeOffer);

    return {
      agent: name,
      model,
      picks: reordered.length ? reordered : top,
      reasoning: data.reasoning || localReason,
    };
  } catch (error) {
    logger.warn(`${name} falling back:`, error.message);
    return {
      agent: name,
      model: 'local-fallback',
      picks: top,
      reasoning: `${localReason} (NVIDIA unavailable: ${error.message})`,
    };
  }
}

async function runConciergeAgent({ brief, cheapest, shortest, best, agents }) {
  const payload = {
    brief,
    cheapest: cheapest.slice(0, 3).map(summarizeOffer),
    shortest: shortest.slice(0, 3).map(summarizeOffer),
    best: best.slice(0, 3).map(summarizeOffer),
  };

  const defaultRec = {
    headline: 'Your AI travel desk recommends',
    recommendationId: (best[0] || cheapest[0] || shortest[0])?.id || null,
    summary:
      brief.preference === 'cheapest'
        ? 'Lean into the PriceHunter pick if budget is the priority; watch baggage fees on ultra-low-cost carriers.'
        : brief.preference === 'shortest'
          ? 'TimeOptimizer favors the quickest door-to-door option—often worth a modest premium.'
          : 'RouteAdvisor balances fare, duration, stops, and comfort for the best overall journey.',
    tips: [
      'Compare nonstop premium vs one-stop savings before booking.',
      'Morning departures usually leave more recovery buffer for connections.',
      'Confirm baggage rules on budget airlines.',
    ],
  };

  if (!hasNvidiaKey()) {
    return {
      agent: 'Concierge',
      model: 'local-fallback',
      ...defaultRec,
      reasoning: 'Synthesized locally from specialist rankings.',
    };
  }

  try {
    const { data, model } = await generateJson({
      model: MODELS.concierge,
      system:
        'You are Concierge, the lead AI travel agent for SkyAgent. Speak like a sharp 21st-century travel advisor—warm, decisive, no fluff.',
      user: `Trip brief: ${JSON.stringify(brief)}
Specialist outputs: ${JSON.stringify(
        agents.map((a) => ({ agent: a.agent, reasoning: a.reasoning, top: a.picks?.[0]?.id })),
        null,
        2
      )}
Candidate groups: ${JSON.stringify(payload, null, 2)}
Return JSON:
{
  "headline": "short punchy headline",
  "recommendationId": "offer id",
  "summary": "3-5 sentence advice",
  "tips": ["tip1","tip2","tip3"]
}`,
      maxTokens: 700,
      temperature: 0.4,
    });

    return {
      agent: 'Concierge',
      model,
      headline: data.headline || defaultRec.headline,
      recommendationId: data.recommendationId || defaultRec.recommendationId,
      summary: data.summary || defaultRec.summary,
      tips: Array.isArray(data.tips) ? data.tips.slice(0, 5) : defaultRec.tips,
      reasoning: 'NVIDIA Concierge synthesized specialist findings.',
    };
  } catch (error) {
    logger.warn('Concierge falling back:', error.message);
    return {
      agent: 'Concierge',
      model: 'local-fallback',
      ...defaultRec,
      reasoning: `Local synthesis (NVIDIA unavailable: ${error.message})`,
    };
  }
}

async function searchFlights(input = {}) {
  const form = {
    origin: input.origin,
    destination: input.destination,
    departDate: input.departDate,
    returnDate: input.returnDate || null,
    passengers: input.passengers || 1,
    cabin: input.cabin || 'economy',
    preference: input.preference || 'best',
  };

  const intent = await runIntentAgent({ message: input.query || input.message || '', form });
  const brief = intent.brief;

  if (!brief.origin || !brief.destination) {
    const error = new Error('Please provide origin and destination (airport code or city).');
    error.status = 400;
    throw error;
  }

  if (!brief.departDate) {
    brief.departDate = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  }

  const offers = generateOffers({
    origin: brief.origin,
    destination: brief.destination,
    departDate: brief.departDate,
    returnDate: brief.returnDate,
    cabin: brief.cabin,
    passengers: brief.passengers,
  });

  const cheapestOffers = rankCheapest(offers);
  const shortestOffers = rankShortest(offers);
  const bestOffers = rankBest(offers);

  const [priceAgent, timeAgent, routeAgent] = await Promise.all([
    runSpecialistAgent({
      name: 'PriceHunter',
      modelRole: 'specialist',
      focus: 'minimize total fare while flagging junk-fee traps',
      offers: cheapestOffers,
    }),
    runSpecialistAgent({
      name: 'TimeOptimizer',
      modelRole: 'specialist',
      focus: 'minimize door-to-door duration and risky layovers',
      offers: shortestOffers,
    }),
    runSpecialistAgent({
      name: 'RouteAdvisor',
      modelRole: 'specialist',
      focus: 'best overall route quality: value, time, comfort, reliability',
      offers: bestOffers,
    }),
  ]);

  const agents = [intent, priceAgent, timeAgent, routeAgent];
  const concierge = await runConciergeAgent({
    brief,
    cheapest: cheapestOffers,
    shortest: shortestOffers,
    best: bestOffers,
    agents,
  });
  agents.push(concierge);

  const allById = Object.fromEntries(offers.map((o) => [o.id, o]));
  const recommendation = allById[concierge.recommendationId] || bestOffers[0] || cheapestOffers[0];

  return {
    brief,
    nvidiaEnabled: hasNvidiaKey(),
    recommendation,
    buckets: {
      cheapest: cheapestOffers,
      shortest: shortestOffers,
      best: bestOffers,
    },
    agents,
    offerCount: offers.length,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  searchFlights,
  localIntentParse,
  rankCheapest,
  rankShortest,
  rankBest,
};
