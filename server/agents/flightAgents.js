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
const { buildFlightBookingLinks } = require('../services/bookingLinks');

function summarizeOffer(offer) {
  return {
    id: offer.id,
    price: offer.price,
    currency: offer.currency,
    stops: offer.stops,
    stopAirports: offer.stopAirports || [],
    stopsLabel: offer.stopsLabel,
    durationMinutes: offer.durationMinutes,
    durationLabel: offer.durationLabel,
    airlines: offer.airlines,
    comfortScore: offer.comfortScore,
    baggageIncluded: offer.baggageIncluded,
    path: offer.segments.map((s) => `${s.origin}→${s.destination} (${s.airlineName})`).join(' · '),
    departAt: offer.segments[0]?.departAt,
    departDate: offer.departDate,
    returnDate: offer.returnDate || null,
    passengers: offer.passengers,
  };
}

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function isoFromParts(year, monthIndex, day) {
  const d = new Date(Date.UTC(year, monthIndex, day));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function upcomingDate(monthIndex, day, from = new Date()) {
  const yearNow = from.getUTCFullYear();
  let candidate = isoFromParts(yearNow, monthIndex, day);
  const todayIso = from.toISOString().slice(0, 10);
  if (candidate && candidate < todayIso) {
    candidate = isoFromParts(yearNow + 1, monthIndex, day);
  }
  return candidate;
}

function parseDatesFromText(text, fallback = {}) {
  let departDate = fallback.departDate || null;
  let returnDate = fallback.returnDate || null;

  const isoPairs = [...String(text).matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)].map((m) => m[0]);
  if (isoPairs[0]) departDate = isoPairs[0];
  if (isoPairs[1]) returnDate = isoPairs[1];

  const monthDay = [...String(text).matchAll(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/gi
  )];

  if (monthDay.length) {
    const parsed = monthDay.map((m) => {
      const monthIndex = MONTHS[m[1].toLowerCase()];
      const day = Number(m[2]);
      const year = m[3] ? Number(m[3]) : null;
      if (year) return isoFromParts(year, monthIndex, day);
      return upcomingDate(monthIndex, day);
    }).filter(Boolean);
    if (parsed[0]) departDate = parsed[0];
    if (parsed[1]) returnDate = parsed[1];
  }

  // "leaving Sept 12, back Sept 20" / "return September 20"
  if (!returnDate) {
    const back = String(text).match(
      /\b(?:back|returning|return(?:ing)?)\s+(?:on\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i
    );
    if (back) {
      const monthIndex = MONTHS[back[1].toLowerCase()];
      const day = Number(back[2]);
      returnDate = back[3]
        ? isoFromParts(Number(back[3]), monthIndex, day)
        : upcomingDate(monthIndex, day);
    }
  }

  return { departDate, returnDate };
}

function localIntentParse(message, fallback = {}) {
  const text = String(message || '');
  const upper = text.toUpperCase();
  const airportMatches = upper.match(/\b[A-Z]{3}\b/g) || [];
  const known = new Set([
    'JFK', 'EWR', 'LGA', 'LAX', 'SFO', 'SEA', 'ORD', 'ATL', 'MIA', 'BOS',
    'LHR', 'LGW', 'CDG', 'FRA', 'AMS', 'DXB', 'DOH', 'NRT', 'HND', 'ICN',
    'SIN', 'SYD', 'BKK', 'BDA', 'YYZ', 'PHL', 'CLT',
  ]);
  const codes = airportMatches.filter((c) => known.has(c));

  let origin = fallback.origin || codes[0] || null;
  let destination = fallback.destination || codes[1] || null;

  const fromTo = text.match(/from\s+([A-Za-z\s]+?)\s+to\s+([A-Za-z\s]+?)(?:\s|$|,|\.|on|next|under|leaving|august|september|october)/i);
  if (fromTo) {
    origin = normalizeAirport(fromTo[1]) || origin;
    destination = normalizeAirport(fromTo[2]) || destination;
  }

  const toFrom = text.match(/to\s+([A-Za-z\s]+?)\s+from\s+([A-Za-z\s]+?)(?:\s|$|,|\.|on|next|under|leaving)/i);
  if (toFrom) {
    destination = normalizeAirport(toFrom[1]) || destination;
    origin = normalizeAirport(toFrom[2]) || origin;
  }

  // City names without from/to
  if (!origin && /bermuda/i.test(text)) origin = 'BDA';
  if (!destination && /\blondon\b/i.test(text)) destination = 'LHR';
  if (!destination && /\bparis\b/i.test(text)) destination = 'CDG';
  if (!destination && /\btokyo\b/i.test(text)) destination = 'NRT';

  const preference = /cheap|budget|lowest|affordable/i.test(text)
    ? 'cheapest'
    : /short|fast|quick|nonstop|direct/i.test(text)
      ? 'shortest'
      : /best|comfort|balanced|recommend/i.test(text)
        ? 'best'
        : fallback.preference || 'best';

  const familyMentioned = /\b(family|families|kids|children|child|wife|husband|spouse|partner|toddler|baby|babies)\b/i.test(text);
  let passengers = Number(fallback.passengers) || null;
  const partyMatch = text.match(
    /\b(?:party of|family of|group of|for)\s+(\d{1,2})\b|\b(\d{1,2})\s*(?:passengers?|people|persons?|travellers?|travelers?|of us|tickets?)\b|\b(?:me and|with)\s+(\d{1,2})\s*(?:others?|kids?|children)?\b/i
  );
  if (partyMatch) {
    passengers = Number(partyMatch[1] || partyMatch[2] || partyMatch[3]);
  } else if (/\b(just me|solo|one passenger|1 passenger)\b/i.test(text)) {
    passengers = 1;
  } else if (/\b(couple|two of us|me and my (wife|husband|partner|spouse))\b/i.test(text)) {
    passengers = 2;
  }

  const needsPassengerCount = Boolean(
    familyMentioned && !passengers && !fallback.passengers
  );

  const today = new Date();
  const parsedDates = parseDatesFromText(text, fallback);
  const defaultDepart = new Date(today.getTime() + 21 * 86400000);
  let departDate = parsedDates.departDate || fallback.departDate || defaultDepart.toISOString().slice(0, 10);
  let returnDate = parsedDates.returnDate || fallback.returnDate || null;

  // Never use past years from models/text without an explicit year far in the past
  if (departDate && departDate < today.toISOString().slice(0, 10)) {
    const [, mm, dd] = departDate.split('-').map(Number);
    departDate = upcomingDate(mm - 1, dd, today) || departDate;
  }
  if (returnDate && departDate && returnDate < departDate) {
    const [, mm, dd] = returnDate.split('-').map(Number);
    const after = upcomingDate(mm - 1, dd, new Date(`${departDate}T12:00:00Z`));
    returnDate = after && after >= departDate ? after : returnDate;
  }

  if (/round\s*trip|returning|return|weekend|back\b/i.test(text) && !returnDate) {
    const ret = new Date(`${departDate}T12:00:00Z`);
    ret.setUTCDate(ret.getUTCDate() + 7);
    returnDate = ret.toISOString().slice(0, 10);
  }

  return {
    origin,
    destination,
    departDate,
    returnDate,
    passengers: passengers || Number(fallback.passengers) || 1,
    familyMentioned,
    needsPassengerCount,
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
        `You are IntentAgent for SkyAgent, a 21st-century travel AI. Extract flight search intent. Use IATA airport codes when possible. Today is ${new Date().toISOString().slice(0, 10)}. If the user gives a month/day without a year, use the next upcoming date in ${new Date().getUTCFullYear()} or ${new Date().getUTCFullYear() + 1} — never a past year.`,
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

    const mergedDates = parseDatesFromText(message, {
      departDate: form?.departDate || data.departDate,
      returnDate: form?.returnDate || data.returnDate,
    });

    const brief = {
      origin: normalizeAirport(form?.origin) || normalizeAirport(data.origin) || fallback.origin,
      destination: normalizeAirport(form?.destination) || normalizeAirport(data.destination) || fallback.destination,
      departDate: form?.departDate || mergedDates.departDate || data.departDate || fallback.departDate,
      returnDate: form?.returnDate || mergedDates.returnDate || data.returnDate || fallback.returnDate,
      // If user said "family" with no count, don't trust a model default of 1
      passengers: form?.passengers
        || (fallback.needsPassengerCount
          ? null
          : (Number(data.passengers) || fallback.passengers || 1)),
      familyMentioned: fallback.familyMentioned,
      needsPassengerCount: Boolean(fallback.needsPassengerCount && !form?.passengers),
      cabin: form?.cabin || data.cabin || fallback.cabin,
      preference: form?.preference || data.preference || fallback.preference,
      notes: data.notes || fallback.notes,
    };

    // Clamp past years from the model
    const todayIso = new Date().toISOString().slice(0, 10);
    if (brief.departDate && brief.departDate < todayIso) {
      const [, mm, dd] = brief.departDate.split('-').map(Number);
      brief.departDate = upcomingDate(mm - 1, dd) || fallback.departDate;
    }

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
        'You are Concierge, the lead AI travel agent for SkyAgent. Speak like a sharp 21st-century travel advisor—warm, decisive, no fluff. ONLY cite airlines and routings that appear in the candidate offers. Never invent nonstop service that is not in the offer path (e.g. do not claim Qatar flies Bermuda–London nonstop).',
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
  const rememberedPassengers = Number(input.passengers);
  const agesInput = Array.isArray(input.ages)
    ? input.ages.map((a) => Number(a)).filter((a) => Number.isFinite(a) && a >= 0 && a < 120)
    : null;

  const form = {
    origin: input.origin,
    destination: input.destination,
    departDate: input.departDate,
    returnDate: input.returnDate || null,
    passengers: Number.isFinite(rememberedPassengers) && rememberedPassengers > 0
      ? rememberedPassengers
      : undefined,
    ages: agesInput && agesInput.length ? agesInput : undefined,
    cabin: input.cabin || 'economy',
    preference: input.preference || 'best',
  };

  const intent = await runIntentAgent({ message: input.query || input.message || '', form });
  const brief = intent.brief;

  // Remembered / explicit passenger count wins
  if (form.passengers) {
    brief.passengers = form.passengers;
    brief.needsPassengerCount = false;
  }

  if (!brief.origin || !brief.destination) {
    const error = new Error('Please provide origin and destination (airport code or city).');
    error.status = 400;
    throw error;
  }

  if (!brief.departDate) {
    brief.departDate = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
  }

  if (brief.needsPassengerCount) {
    return {
      status: 'needs_clarification',
      clarification: {
        type: 'passenger_count',
        question: 'How many people are flying in your family? I’ll remember this for next time.',
        options: [2, 3, 4, 5, 6],
      },
      brief,
      nvidiaEnabled: hasNvidiaKey(),
      agents: [intent],
      recommendation: null,
      buckets: { cheapest: [], shortest: [], best: [] },
      offerCount: 0,
      generatedAt: new Date().toISOString(),
      pendingQuery: input.query || input.message || '',
    };
  }

  brief.passengers = Number(brief.passengers) || 1;

  const familyTrip = Boolean(brief.familyMentioned || brief.passengers > 1);
  const hasAges = Boolean(form.ages && form.ages.length === brief.passengers);

  if (familyTrip && brief.passengers > 1 && !hasAges) {
    return {
      status: 'needs_clarification',
      clarification: {
        type: 'passenger_ages',
        question: `What are the ages of the ${brief.passengers} travelers? (fares differ for adults, children, and infants)`,
        passengerCount: brief.passengers,
        hints: [
          'Adult: 12+',
          'Child: 2–11',
          'Infant: under 2',
        ],
      },
      brief,
      nvidiaEnabled: hasNvidiaKey(),
      agents: [intent],
      recommendation: null,
      buckets: { cheapest: [], shortest: [], best: [] },
      offerCount: 0,
      generatedAt: new Date().toISOString(),
      pendingQuery: input.query || input.message || '',
    };
  }

  const ages = hasAges ? form.ages : Array(brief.passengers).fill(30);
  const travelers = ages.map((age, i) => ({
    index: i + 1,
    age,
    type: age < 2 ? 'infant' : age < 12 ? 'child' : 'adult',
  }));
  brief.ages = ages;
  brief.travelers = travelers;
  brief.passengerSummary = summarizeTravelers(travelers);

  const offers = generateOffers({
    origin: brief.origin,
    destination: brief.destination,
    departDate: brief.departDate,
    returnDate: brief.returnDate,
    cabin: brief.cabin,
    passengers: brief.passengers,
    ages,
  }).map((o) => ({
    ...o,
    bookingLinks: buildFlightBookingLinks(o, brief),
  }));

  const cheapestOffers = rankCheapest(offers);
  const shortestOffers = rankShortest(offers);
  const bestOffers = rankBest(offers);

  const [priceAgent, timeAgent, routeAgent] = await Promise.all([
    runSpecialistAgent({
      name: 'PriceHunter',
      modelRole: 'specialist',
      focus: 'minimize total fare while flagging junk-fee traps; consider adult/child/infant mix',
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
      focus: 'best overall route quality: value, time, comfort, reliability for this family mix',
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
    status: 'ok',
    type: 'flights',
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

function summarizeTravelers(travelers) {
  const counts = { adult: 0, child: 0, infant: 0 };
  for (const t of travelers) counts[t.type] += 1;
  const parts = [];
  if (counts.adult) parts.push(`${counts.adult} adult${counts.adult > 1 ? 's' : ''}`);
  if (counts.child) parts.push(`${counts.child} child${counts.child > 1 ? 'ren' : ''}`);
  if (counts.infant) parts.push(`${counts.infant} infant${counts.infant > 1 ? 's' : ''}`);
  return parts.join(', ') || '1 adult';
}

module.exports = {
  searchFlights,
  localIntentParse,
  rankCheapest,
  rankShortest,
  rankBest,
};
