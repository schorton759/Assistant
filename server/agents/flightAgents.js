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
const { searchLiveOffers } = require('../services/liveFares');
const { buildPreTripOps, buildTradeoffs } = require('../services/preTripOps');

function shiftIsoDate(iso, days) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function applyFollowUpOverrides(message, fallback = {}, lastTrip = null) {
  const text = String(message || '');
  if (!lastTrip) return fallback;
  const next = { ...fallback };

  const sameTrip = /\b(same trip|that trip|our trip|this trip|same flight|same family trip)\b/i.test(text)
    || (!/\bfrom\b/i.test(text) && !/\bto\b/i.test(text) && /\b(day earlier|day later|one day|leave earlier|leave later|cheaper|nonstop|budget)\b/i.test(text));

  if (sameTrip || /\b(day earlier|day later|leave (a )?day|push (it )?|move (it )?)\b/i.test(text)) {
    next.origin = next.origin || lastTrip.origin;
    next.destination = next.destination || lastTrip.destination;
    next.passengers = next.passengers || lastTrip.passengers;
    next.cabin = next.cabin || lastTrip.cabin;
    if (!next.departDate || sameTrip) next.departDate = lastTrip.departDate;
    if (lastTrip.returnDate && (sameTrip || !next.returnDate)) next.returnDate = lastTrip.returnDate;
  }

  if (/\b(day earlier|one day earlier|leave (a )?day earlier|day before)\b/i.test(text)) {
    next.departDate = shiftIsoDate(next.departDate || lastTrip.departDate, -1);
    if (next.returnDate || lastTrip.returnDate) {
      next.returnDate = shiftIsoDate(next.returnDate || lastTrip.returnDate, -1);
    }
  }
  if (/\b(day later|one day later|leave (a )?day later|day after)\b/i.test(text)) {
    next.departDate = shiftIsoDate(next.departDate || lastTrip.departDate, 1);
    if (next.returnDate || lastTrip.returnDate) {
      next.returnDate = shiftIsoDate(next.returnDate || lastTrip.returnDate, 1);
    }
  }
  if (/\b(avoid red[- ]?eyes?|no red[- ]?eyes?)\b/i.test(text)) next.avoidRedEyes = true;
  if (/\bnonstop|direct only\b/i.test(text)) next.preference = 'shortest';
  if (/\bcheap|budget|lowest\b/i.test(text)) next.preference = 'cheapest';

  return next;
}

function applyTravelerPrefs(offers, prefs = {}) {
  let list = [...offers];
  if (prefs.avoidRedEyes) {
    const filtered = list.filter((o) => {
      const hour = new Date(o.segments?.[0]?.departAt || 0).getUTCHours();
      return Number.isFinite(hour) ? hour >= 6 && hour <= 21 : true;
    });
    if (filtered.length) list = filtered;
  }
  if (Array.isArray(prefs.preferredAirlines) && prefs.preferredAirlines.length) {
    const want = new Set(prefs.preferredAirlines.map((a) => String(a).toLowerCase()));
    const preferred = list.filter((o) =>
      (o.airlines || []).some((name) => want.has(String(name).toLowerCase()))
      || (o.segments || []).some((s) => want.has(String(s.airline || '').toLowerCase()) || want.has(String(s.airlineName || '').toLowerCase()))
    );
    if (preferred.length) list = preferred;
  }
  if (Number(prefs.budgetMax) > 0) {
    const under = list.filter((o) => o.price <= Number(prefs.budgetMax));
    if (under.length) list = under;
  }
  return list;
}

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
  const withFollowUp = applyFollowUpOverrides(message, fallback, fallback.lastTrip || null);
  const text = String(message || '');
  const upper = text.toUpperCase();
  const airportMatches = upper.match(/\b[A-Z]{3}\b/g) || [];
  const known = new Set([
    'JFK', 'EWR', 'LGA', 'LAX', 'SFO', 'SEA', 'ORD', 'ATL', 'MIA', 'BOS',
    'LHR', 'LGW', 'CDG', 'FRA', 'AMS', 'DXB', 'DOH', 'NRT', 'HND', 'ICN',
    'SIN', 'SYD', 'BKK', 'BDA', 'YYZ', 'PHL', 'CLT',
  ]);
  const codes = airportMatches.filter((c) => known.has(c));

  let origin = withFollowUp.origin || codes[0] || null;
  let destination = withFollowUp.destination || codes[1] || null;

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
        : withFollowUp.preference || 'best';

  const familyMentioned = /\b(family|families|kids|children|child|wife|husband|spouse|partner|toddler|baby|babies)\b/i.test(text);
  let passengers = Number(withFollowUp.passengers) || null;
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
    familyMentioned && !passengers && !withFollowUp.passengers
  );

  const today = new Date();
  const parsedDates = parseDatesFromText(text, withFollowUp);
  const defaultDepart = new Date(today.getTime() + 21 * 86400000);
  let departDate = parsedDates.departDate || withFollowUp.departDate || defaultDepart.toISOString().slice(0, 10);
  let returnDate = parsedDates.returnDate || withFollowUp.returnDate || null;

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
    passengers: passengers || Number(withFollowUp.passengers) || 1,
    familyMentioned,
    needsPassengerCount,
    cabin: withFollowUp.cabin || 'economy',
    preference,
    avoidRedEyes: Boolean(withFollowUp.avoidRedEyes) || /\bavoid red[- ]?eyes?\b/i.test(text),
    budgetMax: Number(withFollowUp.budgetMax) || null,
    preferredAirlines: withFollowUp.preferredAirlines || [],
    homeAirport: withFollowUp.homeAirport || null,
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
      ? `Lowest fare ${top[0]?.currency} ${top[0]?.price} on ${top[0]?.airlines?.join('/')} · ${top[0]?.stopsLabel} · ${top[0]?.durationLabel}.`
      : name === 'TimeOptimizer'
        ? `Fastest door-to-door: ${top[0]?.durationLabel} on ${top[0]?.airlines?.join('/')} (${top[0]?.stopsLabel}) at ${top[0]?.currency} ${top[0]?.price}.`
        : `Best overall: ${top[0]?.airlines?.join('/')} · ${top[0]?.stopsLabel} · ${top[0]?.durationLabel} · ${top[0]?.currency} ${top[0]?.price}.`;

  if (!hasNvidiaKey()) {
    return {
      agent: name,
      model: 'skyagent-local',
      picks: top,
      reasoning: localReason,
    };
  }

  try {
    const { data, model } = await generateJson({
      model: MODELS[modelRole] || MODELS.specialist,
      system: `You are ${name}, a specialist AI travel agent. Focus: ${focus}. Be concise and practical. Only cite offers in the list.`,
      user: `Evaluate these flight offers and return JSON:
{
  "pickIds": ["id1","id2","id3"],
  "reasoning": "2 short sentences with concrete prices/times"
}
Offers:
${JSON.stringify(top, null, 2)}`,
      maxTokens: 350,
      temperature: 0.2,
      timeout: 8000,
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
    logger.warn(`${name} using local ranking:`, error.message);
    return {
      agent: name,
      model: 'skyagent-local',
      picks: top,
      reasoning: localReason,
    };
  }
}

function buildSmartLocalConcierge({ brief, cheapest, shortest, best, tradeoffs = [], preTrip = null }) {
  const pick = best[0] || cheapest[0] || shortest[0] || null;
  const cheap = cheapest[0];
  const fast = shortest[0];
  const family = brief.passengers > 1 || (brief.ages || []).some((a) => a < 12);
  const currency = pick?.currency || 'USD';

  let headline = 'Solid pick for this trip';
  let summary;

  if (!pick) {
    return {
      headline: 'No offers yet',
      recommendationId: null,
      summary: 'I need a route and date to recommend anything.',
      tips: preTrip?.tips?.slice(0, 3) || [],
      reasoning: 'No candidate offers to synthesize.',
    };
  }

  if (brief.preference === 'cheapest' && cheap) {
    headline = `Cheapest: ${cheap.airlines?.[0] || 'fare'} · ${currency} ${cheap.price}`;
    summary = `Go with ${cheap.airlines?.join('/')} at ${currency} ${cheap.price} (${cheap.stopsLabel}, ${cheap.durationLabel}).`
      + (cheap.stops > 0 && family
        ? ' With kids, weigh that connection against a nonstop even if it costs more.'
        : ' Confirm bag fees before you lock it in.');
  } else if (brief.preference === 'shortest' && fast) {
    headline = `Fastest: ${fast.durationLabel}`;
    summary = `${fast.airlines?.join('/')} gets you there in ${fast.durationLabel} (${fast.stopsLabel}) for ${currency} ${fast.price}.`
      + (cheap && cheap.id !== fast.id
        ? ` Cheapest alternative is ${currency} ${cheap.price} but takes ${cheap.durationLabel}.`
        : '');
  } else {
    const delta = cheap && pick.id !== cheap.id ? Math.max(0, pick.price - cheap.price) : 0;
    headline = family && pick.stops === 0
      ? `Nonstop for the family · ${currency} ${pick.price}`
      : `Best balance · ${currency} ${pick.price}`;
    summary = `Take ${pick.airlines?.join('/')} — ${pick.stopsLabel}, ${pick.durationLabel}, ${currency} ${pick.price}`
      + (brief.passengerSummary ? ` for ${brief.passengerSummary}` : '')
      + '.'
      + (delta
        ? ` That's ${currency} ${delta} more than the cheapest (${cheap.airlines?.[0]} · ${cheap.stopsLabel}).`
        : ' It also wins on price.')
      + (fast && fast.id !== pick.id
        ? ` Fastest option is ${fast.durationLabel} if time matters more.`
        : '');
  }

  const tips = [];
  if (tradeoffs[0]?.headline) tips.push(tradeoffs[0].headline);
  if (preTrip?.tips?.length) tips.push(...preTrip.tips.slice(0, 2));
  if (pick.stops > 0 && (preTrip?.layoverRisk === 'high' || preTrip?.layoverRisk === 'medium')) {
    tips.push(`Connection risk is ${preTrip.layoverRisk} — leave margin with kids or checked bags.`);
  }
  if (!tips.length) {
    tips.push('Watch the fare or book soon — good family routings move.', 'Reserve seats together right after purchase.');
  }

  return {
    headline,
    recommendationId: pick.id,
    summary,
    tips: tips.slice(0, 4),
    reasoning: 'Local concierge synthesized rankings, tradeoffs, and pre-trip risk into one recommendation.',
  };
}

async function runConciergeAgent({
  brief, cheapest, shortest, best, agents, tradeoffs = [], preTrip = null,
}) {
  const payload = {
    brief,
    cheapest: cheapest.slice(0, 3).map(summarizeOffer),
    shortest: shortest.slice(0, 3).map(summarizeOffer),
    best: best.slice(0, 3).map(summarizeOffer),
  };

  const local = buildSmartLocalConcierge({
    brief, cheapest, shortest, best, tradeoffs, preTrip,
  });

  if (!hasNvidiaKey()) {
    return {
      agent: 'Concierge',
      model: 'skyagent-local',
      ...local,
    };
  }

  try {
    const { data, model } = await generateJson({
      model: MODELS.concierge,
      system:
        'You are Concierge, SkyAgent\'s lead travel advisor. Warm, decisive, concrete. ONLY cite airlines/routings in the candidate offers. Never invent nonstops. Prefer one clear recommendation and name the price delta vs cheapest when relevant.',
      user: `Trip brief: ${JSON.stringify(brief)}
Specialists: ${JSON.stringify(
        agents.map((a) => ({ agent: a.agent, reasoning: a.reasoning, top: a.picks?.[0]?.id })),
        null,
        2
      )}
Tradeoffs: ${JSON.stringify(tradeoffs)}
Pre-trip: ${JSON.stringify(preTrip?.tips?.slice(0, 3) || [])}
Candidates: ${JSON.stringify(payload)}
Local draft (improve or keep): ${JSON.stringify(local)}
Return JSON:
{
  "headline": "short punchy headline with price or time",
  "recommendationId": "offer id from candidates",
  "summary": "3-4 concrete sentences",
  "tips": ["tip1","tip2","tip3"]
}`,
      maxTokens: 450,
      temperature: 0.35,
      timeout: 10000,
    });

    // Guard: recommendation must exist in candidates
    const allIds = new Set([
      ...best.map((o) => o.id),
      ...cheapest.map((o) => o.id),
      ...shortest.map((o) => o.id),
    ]);
    const recId = allIds.has(data.recommendationId) ? data.recommendationId : local.recommendationId;

    return {
      agent: 'Concierge',
      model,
      headline: data.headline || local.headline,
      recommendationId: recId,
      summary: data.summary || local.summary,
      tips: Array.isArray(data.tips) && data.tips.length ? data.tips.slice(0, 5) : local.tips,
      reasoning: 'NVIDIA Concierge refined the local draft with specialist findings.',
    };
  } catch (error) {
    logger.warn('Concierge using smart local synthesis:', error.message);
    return {
      agent: 'Concierge',
      model: 'skyagent-local',
      ...local,
      reasoning: `${local.reasoning} (NVIDIA skipped: ${error.message})`,
    };
  }
}

async function searchFlights(input = {}) {
  const rememberedPassengers = Number(input.passengers);
  const agesInput = Array.isArray(input.ages)
    ? input.ages.map((a) => Number(a)).filter((a) => Number.isFinite(a) && a >= 0 && a < 120)
    : null;

  const prefs = {
    avoidRedEyes: Boolean(input.avoidRedEyes || input.prefs?.avoidRedEyes),
    budgetMax: Number(input.budgetMax || input.prefs?.budgetMax) || null,
    preferredAirlines: input.preferredAirlines || input.prefs?.preferredAirlines || [],
    homeAirport: normalizeAirport(input.homeAirport || input.prefs?.homeAirport) || null,
  };

  const form = {
    origin: input.origin || prefs.homeAirport,
    destination: input.destination,
    departDate: input.departDate,
    returnDate: input.returnDate || null,
    passengers: Number.isFinite(rememberedPassengers) && rememberedPassengers > 0
      ? rememberedPassengers
      : undefined,
    ages: agesInput && agesInput.length ? agesInput : undefined,
    cabin: input.cabin || 'economy',
    preference: input.preference || 'best',
    avoidRedEyes: prefs.avoidRedEyes,
    budgetMax: prefs.budgetMax,
    preferredAirlines: prefs.preferredAirlines,
    homeAirport: prefs.homeAirport,
    lastTrip: input.lastTrip || null,
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

  const live = await searchLiveOffers({
    origin: brief.origin,
    destination: brief.destination,
    departDate: brief.departDate,
    returnDate: brief.returnDate,
    cabin: brief.cabin,
    passengers: brief.passengers,
    ages,
  });

  let offers;
  let pricing;
  if (live.live && live.offers.length) {
    // Prefer real market fares so "cheapest" means market-cheapest, not catalog fantasy.
    offers = live.offers;
    pricing = {
      mode: 'live',
      providers: live.providers,
      sourcesCompared: live.providers,
      note: 'Compared '
        + live.providers.join(' + ')
        + ' and kept the cheapest fare per itinerary. Cached fares can lag — confirm on the booking site.',
    };
  } else {
    offers = generateOffers({
      origin: brief.origin,
      destination: brief.destination,
      departDate: brief.departDate,
      returnDate: brief.returnDate,
      cabin: brief.cabin,
      passengers: brief.passengers,
      ages,
    });
    pricing = {
      mode: 'catalog',
      providers: [],
      sourcesCompared: [],
      note: live.disabled
        ? 'Demo catalog prices (live fares disabled). Set TRAVELPAYOUTS_TOKEN or LIVE_FARES=1.'
        : 'No live market rows for this route/date yet — showing route-aware demo catalog. Try nearby dates or a major city pair.',
      errors: live.errors || [],
    };
  }

  offers = applyTravelerPrefs(offers, {
    avoidRedEyes: brief.avoidRedEyes || prefs.avoidRedEyes,
    budgetMax: brief.budgetMax || prefs.budgetMax,
    preferredAirlines: prefs.preferredAirlines,
  });

  offers = offers.map((o) => ({
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

  // Draft tradeoffs/pre-trip from best pick so concierge can use them
  const draftRec = bestOffers[0] || cheapestOffers[0] || shortestOffers[0];
  const draftTradeoffs = buildTradeoffs({
    recommendation: draftRec,
    cheapest: cheapestOffers[0],
    shortest: shortestOffers[0],
  });
  const draftPreTrip = buildPreTripOps({
    brief,
    recommendation: draftRec,
    cheapest: cheapestOffers[0],
  });

  const concierge = await runConciergeAgent({
    brief,
    cheapest: cheapestOffers,
    shortest: shortestOffers,
    best: bestOffers,
    agents,
    tradeoffs: draftTradeoffs,
    preTrip: draftPreTrip,
  });
  agents.push(concierge);

  const allById = Object.fromEntries(offers.map((o) => [o.id, o]));
  const recommendation = allById[concierge.recommendationId] || draftRec;
  const tradeoffs = buildTradeoffs({
    recommendation,
    cheapest: cheapestOffers[0],
    shortest: shortestOffers[0],
  });
  const preTrip = buildPreTripOps({
    brief,
    recommendation,
    cheapest: cheapestOffers[0],
  });

  if (!concierge.tips?.length) {
    concierge.tips = preTrip.tips.slice(0, 3);
  }

  return {
    status: 'ok',
    type: 'flights',
    brief,
    prefs,
    nvidiaEnabled: hasNvidiaKey(),
    pricing,
    recommendation,
    tradeoffs,
    preTrip,
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
  buildSmartLocalConcierge,
};
