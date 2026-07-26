# SkyAgent — AI travel desk for iPhone

A multi-agent flight finder built on **free NVIDIA NIM** models. Think travel agent for the 21st century: ask in plain English, get cheapest / shortest / best routes in seconds.

## Architecture

```
iPhone (Expo Go)  →  /api/flights/search  →  Agent desk
                                              ├─ IntentAgent      (meta/llama-3.1-8b-instruct)
                                              ├─ PriceHunter      (nemotron-nano-8b)
                                              ├─ TimeOptimizer    (nemotron-nano-8b)
                                              ├─ RouteAdvisor     (nemotron-nano-8b)
                                              └─ Concierge        (nemotron-super-49b)
```

**Live prices first.** SkyAgent queries Travelpayouts/Aviasales market caches (and Duffel when `DUFFEL_ACCESS_TOKEN` is set), dedupes across sources, and ranks the cheapest real public fares. Amadeus Self-Service was shut down in July 2026, so it is not used. If a thin route has no live rows, SkyAgent falls back to a route-aware demo catalog and labels it clearly — never mixes fake catalog fares into a live “cheapest” list.

**Trip dashboard.** Save a search to one plan with flight / hotel / car / transfer status (selected → watching → booked / skipped) and booking progress.

**Smarter concierge.** Fast local synthesis with real price/time deltas; NVIDIA calls use shorter timeouts and a quicker default model, with `skyagent-local` when offline instead of empty fallbacks.

**Saved trips + price watch.** After a search, tap **Watch this trip** — SkyAgent remembers the route, dates, and family ages, and alerts when the cheapest fare drops ~8% below what you saw (or your target). Watches re-check when you open the app.

**Traveler memory.** Home airport, budget cap, avoid-red-eyes, and last trip — so “same trip but leave a day earlier” just works.

**Whole-trip desk.** Ask for a full plan and get flights + hotels + transfers + cars together, with honest tradeoffs and pre-trip ops (layover risk, bags, visas, seats, packing).

**Share + post-book.** Share a trip link / `.ics` calendar with a partner. Paste a confirmation to get reminders, tips, and a calendar file.

Ask about a rental car and SkyAgent adds car options (or cars alone). Tap a result for details, then **Continue to book** — opens the live market offer (when available) or the airline/vendor / Google Flights / Kayak / Skyscanner with route, dates, and passenger mix prefilled. Airlines do not allow full checkout autofill without a partner API; deep links are the practical approach.

True unpublished consolidator/net fares still need an IATA/ARC agency contract — public meta-search is the honest ceiling without that.

## Quick start

```bash
# API + mobile Safari web UI
cp .env.example .env   # add NVIDIA_API_KEY when ready
npm install
npm run start:flights
# open http://localhost:3000/skyagent/  (or Add to Home Screen on iPhone)
```

### Mobile Safari / PWA

The web UI at `/skyagent/` is built for iPhone Safari. Tap **Share → Add to Home Screen** for a full-screen app feel.

### Expo iPhone app

```bash
cd mobile && npm install
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3000 npx expo start
# open in Expo Go on iPhone
```

## API

`POST /api/flights/search`

```json
{
  "origin": "JFK",
  "destination": "LHR",
  "departDate": "2026-08-20",
  "query": "cheapest afternoon departure",
  "preference": "best"
}
```

`POST /api/flights/ask`

```json
{ "message": "Fastest SFO to Tokyo round trip next month" }
```

## Tests

```bash
npm run test:flights
```
