/**
 * Pre-trip operational tips: layover risk, bags, visas, packing, kids.
 */

function layoverRisk(offer) {
  if (!offer?.stops) return { level: 'low', note: 'Nonstop — simplest with kids or jet lag.' };
  const layover = offer.segments?.[1]?.layoverMinutes;
  if (!layover) return { level: 'medium', note: `${offer.stopsLabel} — confirm connection time on the ticket.` };
  if (layover < 75) {
    return { level: 'high', note: `Only ${Math.round(layover)}m connection — tight with kids or checked bags.` };
  }
  if (layover < 120) {
    return { level: 'medium', note: `${Math.round(layover)}m layover — doable if you stay airside and move promptly.` };
  }
  return { level: 'low', note: `${Math.round(layover)}m layover — comfortable buffer.` };
}

function bagHint(offer) {
  if (offer?.baggageIncluded) return 'Checked bag appears included on this offer — still verify cabin + checked on the airline site.';
  return 'Bags likely extra on this fare class — price a 23kg bag before you commit.';
}

function visaHint(origin, destination) {
  const o = String(origin || '').toUpperCase();
  const d = String(destination || '').toUpperCase();
  const uk = ['LHR', 'LGW', 'STN', 'MAN', 'EDI'].includes(d);
  const us = ['JFK', 'EWR', 'LGA', 'MIA', 'ATL', 'ORD', 'LAX', 'SFO', 'BOS'].includes(d);
  const eu = ['CDG', 'AMS', 'FRA', 'MUC', 'MAD', 'FCO'].includes(d);

  if (o === 'BDA' && uk) {
    return 'Bermuda → UK: British Overseas Territories citizens usually enter the UK freely; other nationalities should check UK ETA / visa rules.';
  }
  if (uk) return 'UK arrivals: many nationalities now need an ETA before travel — check gov.uk before you book non-refundable fares.';
  if (us) return 'US arrivals: ESTA/visa as required; allow extra time at immigration with kids.';
  if (eu) return 'Schengen: confirm passport validity (often 3 months beyond stay) and any ETIAS requirements.';
  return 'Confirm passport validity (6 months is a safe rule of thumb) and any visas for every traveler.';
}

function seatHint(passengers = 1, ages = []) {
  const kids = (ages || []).filter((a) => a < 12).length;
  if (kids) {
    return `Ask for bulkhead or exit-adjacent only if kids meet age rules — better: reserve seats together now (${passengers} travelers, ${kids} under 12).`;
  }
  if (passengers > 1) return 'Reserve adjacent seats as soon as the booking opens — cheap fares often unbundle seat selection.';
  return 'Seat maps open at booking or T-24h depending on airline — set a reminder.';
}

function packingHint(origin, destination) {
  const d = String(destination || '').toUpperCase();
  if (['LHR', 'LGW'].includes(d)) return 'London: layers + rain shell year-round; umbrella beats fashion.';
  if (['CDG', 'ORY'].includes(d)) return 'Paris: comfortable walking shoes; metro stairs are real.';
  if (origin === 'BDA') return 'From Bermuda: light layers for departure, cooler kit for arrival if heading to Europe.';
  return 'Pack a personal-item layer for the cabin and keep meds / passports on you — not in checked bags.';
}

function buildPreTripOps({ brief = {}, recommendation = null, cheapest = null } = {}) {
  const offer = recommendation || cheapest || null;
  const risk = layoverRisk(offer);
  const tips = [
    risk.note,
    bagHint(offer),
    seatHint(brief.passengers, brief.ages),
    visaHint(brief.origin, brief.destination),
    packingHint(brief.origin, brief.destination),
  ];

  if (brief.ages?.some((a) => a < 2)) {
    tips.push('Infant: confirm lap vs seat fare and bassinet request; gates board early — use it.');
  }

  return {
    layoverRisk: risk.level,
    tips,
    checklist: [
      'Passports match ticket names',
      'Seats reserved together',
      'Bag allowance checked',
      'ETA/visa if required',
      'Airport transfer timed to landing',
    ],
  };
}

function buildTradeoffs({ recommendation, cheapest, shortest } = {}) {
  const rec = recommendation;
  const cheap = cheapest;
  const fast = shortest;
  if (!rec) return [];

  const lines = [];
  if (cheap && cheap.id !== rec.id) {
    const delta = Math.max(0, (rec.price || 0) - (cheap.price || 0));
    lines.push({
      id: 'price_vs_pick',
      headline: delta
        ? `Recommended is $${delta} more than the cheapest`
        : 'Recommended matches the cheapest fare',
      detail: cheap.id !== rec.id
        ? `${cheap.airlines?.[0] || 'Cheapest'} · ${cheap.stopsLabel} · ${cheap.durationLabel} at $${cheap.price} vs your pick at $${rec.price}.`
        : `${rec.airlines?.[0]} already wins on price.`,
      chooseId: cheap.id,
      chooseLabel: 'See cheapest',
    });
  }
  if (fast && fast.id !== rec.id) {
    const saved = Math.max(0, (rec.durationMinutes || 0) - (fast.durationMinutes || 0));
    lines.push({
      id: 'time_vs_pick',
      headline: saved
        ? `Fastest saves ~${Math.round(saved / 60)}h ${saved % 60}m`
        : 'Recommended is already among the fastest',
      detail: `${fast.airlines?.[0] || 'Fastest'} · ${fast.stopsLabel} · ${fast.durationLabel} at $${fast.price}.`,
      chooseId: fast.id,
      chooseLabel: 'See fastest',
    });
  }
  if (rec.stops === 0) {
    lines.push({
      id: 'nonstop',
      headline: 'Nonstop wins with kids or jet lag',
      detail: 'Paying more for nonstop is usually the right call for families — fewer missed-bag and gate-run risks.',
    });
  } else if (rec.stops >= 1) {
    lines.push({
      id: 'connection',
      headline: 'Connection tradeoff',
      detail: `${rec.stopsLabel}. Worth it only if the savings beat the hassle — for families, lean nonstop when the gap is small.`,
    });
  }
  return lines;
}

module.exports = {
  buildPreTripOps,
  buildTradeoffs,
  layoverRisk,
};
