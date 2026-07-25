# SkyAgent (iPhone)

AI travel desk for iPhone — multi-agent flight search powered by free NVIDIA NIM models.

## What it does

Ask in plain English (“cheapest JFK to London next month”). Five agents collaborate:

1. **IntentAgent** — parses the trip brief  
2. **PriceHunter** — cheapest fares  
3. **TimeOptimizer** — shortest door-to-door  
4. **RouteAdvisor** — best overall route  
5. **Concierge** — final travel-agent recommendation  

## Run on iPhone

1. Start the API from the repo root:

```bash
SKIP_MONGODB=true NODE_ENV=development npm run start:flights
```

2. In another terminal:

```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3000 npx expo start
```

3. Scan the QR code with **Expo Go** on your iPhone (same Wi-Fi).

### NVIDIA free models

Set `NVIDIA_API_KEY` from [build.nvidia.com](https://build.nvidia.com) in the root `.env`. Without it, SkyAgent still ranks flights locally.

Optional model overrides:

```bash
NVIDIA_MODEL_INTENT=meta/llama-3.1-8b-instruct
NVIDIA_MODEL_SPECIALIST=nvidia/llama-3.1-nemotron-nano-8b-v1
NVIDIA_MODEL_CONCIERGE=nvidia/llama-3.3-nemotron-super-49b-v1.5
```
