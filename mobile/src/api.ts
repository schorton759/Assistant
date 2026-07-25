import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type FlightOffer = {
  id: string;
  origin: string;
  destination: string;
  price: number;
  currency: string;
  stops: number;
  stopsLabel: string;
  durationMinutes: number;
  durationLabel: string;
  airlines: string[];
  comfortScore: number;
  baggageIncluded: boolean;
  segments: Array<{
    airline: string;
    airlineName: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departAt: string;
    arriveAt: string;
    durationLabel: string;
  }>;
};

export type AgentTrace = {
  agent: string;
  model: string;
  reasoning?: string;
  headline?: string;
  summary?: string;
  tips?: string[];
  picks?: Array<{ id: string }>;
};

export type FlightSearchResult = {
  brief: {
    origin: string;
    destination: string;
    departDate: string;
    returnDate?: string | null;
    preference?: string;
  };
  nvidiaEnabled: boolean;
  recommendation: FlightOffer | null;
  buckets: {
    cheapest: FlightOffer[];
    shortest: FlightOffer[];
    best: FlightOffer[];
  };
  agents: AgentTrace[];
  offerCount: number;
};

function resolveApiBase() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const fromExtra = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (fromExtra && !fromExtra.includes('localhost')) {
    return fromExtra.replace(/\/$/, '');
  }

  // Android emulator reaches host machine via 10.0.2.2
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }

  return 'http://localhost:3000';
}

export async function searchFlights(body: {
  query?: string;
  origin?: string;
  destination?: string;
  departDate?: string;
  returnDate?: string;
  preference?: string;
  passengers?: number;
  cabin?: string;
}): Promise<FlightSearchResult> {
  const base = resolveApiBase();
  const response = await fetch(`${base}/api/flights/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Search failed (${response.status})`);
  }
  return data;
}
