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

Flight offers come from a deterministic catalog shaped like real multi-airline itineraries (nonstop, 1-stop, multi-stop, ULCC vs premium). Agents rank and explain; with `NVIDIA_API_KEY` they reason in natural language.

## Quick start

```bash
# API
cp .env.example .env   # add NVIDIA_API_KEY when ready
npm install
npm run start:flights

# iPhone app
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
