import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  useFonts,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { searchFlights, FlightOffer, FlightSearchResult } from './src/api';
import { colors } from './src/theme';

type BucketKey = 'cheapest' | 'shortest' | 'best';

const QUICK_PROMPTS = [
  'Cheapest JFK to LHR next month',
  'Fastest SFO to Tokyo round trip',
  'Best LAX to Paris under comfort',
];

function formatMoney(amount: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount}`;
  }
}

function OfferRow({
  offer,
  highlighted,
}: {
  offer: FlightOffer;
  highlighted?: boolean;
}) {
  return (
    <View style={[styles.offerRow, highlighted && styles.offerHighlight]}>
      <View style={styles.offerTop}>
        <Text style={styles.offerRoute}>
          {offer.origin} → {offer.destination}
        </Text>
        <Text style={styles.offerPrice}>
          {formatMoney(offer.price, offer.currency)}
        </Text>
      </View>
      <Text style={styles.offerMeta}>
        {offer.durationLabel} · {offer.stopsLabel} · {offer.airlines.join(', ')}
      </Text>
      <Text style={styles.offerSoft}>
        Comfort {offer.comfortScore}
        {offer.baggageIncluded ? ' · bags included' : ' · bags extra'}
      </Text>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  const [query, setQuery] = useState('Find the best flight from JFK to London next month');
  const [origin, setOrigin] = useState('JFK');
  const [destination, setDestination] = useState('LHR');
  const [bucket, setBucket] = useState<BucketKey>('best');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FlightSearchResult | null>(null);
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroLift = useRef(new Animated.Value(18)).current;
  const ctaPulse = useRef(new Animated.Value(1)).current;
  const resultsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(heroLift, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, { toValue: 1.02, duration: 1200, useNativeDriver: true }),
        Animated.timing(ctaPulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [heroOpacity, heroLift, ctaPulse]);

  useEffect(() => {
    if (!result) return;
    resultsOpacity.setValue(0);
    Animated.timing(resultsOpacity, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [result, resultsOpacity]);

  const offers = useMemo(() => {
    if (!result) return [];
    return result.buckets[bucket] || [];
  }, [result, bucket]);

  const onSearch = async (overrideQuery?: string) => {
    const q = overrideQuery ?? query;
    setLoading(true);
    setError(null);
    try {
      const data = await searchFlights({
        query: q,
        origin,
        destination,
        preference: bucket,
      });
      setResult(data);
      if (data.brief?.preference && ['cheapest', 'shortest', 'best'].includes(data.brief.preference)) {
        setBucket(data.brief.preference as BucketKey);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  if (!fontsLoaded) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.sunrise} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" />
        <LinearGradient
          colors={['#071525', '#0B3A4A', '#1A6B6B']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.orbOne} />
        <View style={styles.orbTwo} />

        <SafeAreaView style={styles.safe}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              contentContainerStyle={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Animated.View
                style={[
                  styles.hero,
                  { opacity: heroOpacity, transform: [{ translateY: heroLift }] },
                ]}
              >
                <Text style={styles.brand}>SkyAgent</Text>
                <Text style={styles.headline}>Your AI travel desk</Text>
                <Text style={styles.subhead}>
                  Ask in plain English. Agents hunt cheapest, shortest, and best routes.
                </Text>
              </Animated.View>

              <View style={styles.askBlock}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Weekend in Tokyo from SFO, keep it under pain…"
                  placeholderTextColor="rgba(232,241,245,0.45)"
                  style={styles.askInput}
                  multiline
                />
                <View style={styles.codeRow}>
                  <TextInput
                    value={origin}
                    onChangeText={setOrigin}
                    autoCapitalize="characters"
                    maxLength={3}
                    style={styles.codeInput}
                    placeholder="FROM"
                    placeholderTextColor="rgba(232,241,245,0.4)"
                  />
                  <Text style={styles.codeArrow}>→</Text>
                  <TextInput
                    value={destination}
                    onChangeText={setDestination}
                    autoCapitalize="characters"
                    maxLength={3}
                    style={styles.codeInput}
                    placeholder="TO"
                    placeholderTextColor="rgba(232,241,245,0.4)"
                  />
                </View>

                <Animated.View style={{ transform: [{ scale: ctaPulse }] }}>
                  <Pressable
                    onPress={() => onSearch()}
                    style={({ pressed }) => [
                      styles.cta,
                      pressed && styles.ctaPressed,
                      loading && styles.ctaDisabled,
                    ]}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#0B1F33" />
                    ) : (
                      <Text style={styles.ctaText}>Ask the agents</Text>
                    )}
                  </Pressable>
                </Animated.View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.promptScroll}>
                  {QUICK_PROMPTS.map((prompt) => (
                    <Pressable
                      key={prompt}
                      onPress={() => {
                        setQuery(prompt);
                        onSearch(prompt);
                      }}
                      style={styles.promptChip}
                    >
                      <Text style={styles.promptText}>{prompt}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {result ? (
                <Animated.View style={[styles.results, { opacity: resultsOpacity }]}>
                  <Text style={styles.sectionLabel}>Concierge</Text>
                  <Text style={styles.conciergeHeadline}>
                    {result.agents.find((a) => a.agent === 'Concierge')?.headline ||
                      'Your AI travel desk recommends'}
                  </Text>
                  <Text style={styles.conciergeSummary}>
                    {result.agents.find((a) => a.agent === 'Concierge')?.summary}
                  </Text>

                  {result.recommendation ? (
                    <OfferRow offer={result.recommendation} highlighted />
                  ) : null}

                  <View style={styles.tabs}>
                    {([
                      ['cheapest', 'Cheapest'],
                      ['shortest', 'Shortest'],
                      ['best', 'Best'],
                    ] as const).map(([key, label]) => (
                      <Pressable
                        key={key}
                        onPress={() => setBucket(key)}
                        style={[styles.tab, bucket === key && styles.tabActive]}
                      >
                        <Text style={[styles.tabText, bucket === key && styles.tabTextActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {offers.map((offer) => (
                    <OfferRow
                      key={offer.id}
                      offer={offer}
                      highlighted={offer.id === result.recommendation?.id}
                    />
                  ))}

                  <Text style={styles.sectionLabel}>Agent desk</Text>
                  {result.agents.map((agent) => (
                    <View key={agent.agent} style={styles.agentRow}>
                      <Text style={styles.agentName}>
                        {agent.agent}
                        <Text style={styles.agentModel}> · {agent.model}</Text>
                      </Text>
                      <Text style={styles.agentReason}>{agent.reasoning}</Text>
                    </View>
                  ))}

                  {!result.nvidiaEnabled ? (
                    <Text style={styles.footnote}>
                      Running on local ranking. Add NVIDIA_API_KEY for live NIM agents.
                    </Text>
                  ) : (
                    <Text style={styles.footnote}>Powered by free NVIDIA NIM models.</Text>
                  )}
                </Animated.View>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy },
  boot: {
    flex: 1,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: 22,
    paddingBottom: 48,
  },
  orbOne: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(244, 180, 96, 0.12)',
    top: -60,
    right: -40,
  },
  orbTwo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(120, 210, 200, 0.12)',
    bottom: 80,
    left: -70,
  },
  hero: {
    marginTop: 18,
  },
  brand: {
    fontFamily: 'Fraunces_700Bold',
    fontSize: 48,
    lineHeight: 54,
    color: colors.mist,
    letterSpacing: -1,
  },
  headline: {
    marginTop: 8,
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 24,
    color: colors.sunrise,
  },
  subhead: {
    marginTop: 10,
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(232,241,245,0.82)',
    maxWidth: 340,
  },
  askBlock: {
    marginTop: 28,
  },
  askInput: {
    minHeight: 96,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(232,241,245,0.28)',
    color: colors.mist,
    fontFamily: 'DMSans_400Regular',
    fontSize: 18,
    lineHeight: 26,
    paddingVertical: 12,
  },
  codeRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(232,241,245,0.28)',
    color: colors.mist,
    fontFamily: 'DMSans_700Bold',
    fontSize: 22,
    letterSpacing: 3,
    paddingVertical: 10,
    textAlign: 'center',
  },
  codeArrow: {
    color: colors.sunrise,
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 22,
  },
  cta: {
    marginTop: 22,
    backgroundColor: colors.sunrise,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  ctaDisabled: { opacity: 0.7 },
  ctaText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 17,
    color: '#0B1F33',
  },
  promptScroll: { marginTop: 16 },
  promptChip: {
    marginRight: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,241,245,0.22)',
  },
  promptText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: 'rgba(232,241,245,0.85)',
  },
  error: {
    marginTop: 16,
    color: '#FFB4A8',
    fontFamily: 'DMSans_500Medium',
  },
  results: { marginTop: 30 },
  sectionLabel: {
    marginTop: 8,
    marginBottom: 8,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(232,241,245,0.55)',
  },
  conciergeHeadline: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 26,
    color: colors.mist,
    marginBottom: 8,
  },
  conciergeSummary: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    lineHeight: 23,
    color: 'rgba(232,241,245,0.85)',
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.sunrise,
  },
  tabText: {
    fontFamily: 'DMSans_500Medium',
    color: 'rgba(232,241,245,0.55)',
  },
  tabTextActive: {
    color: colors.mist,
  },
  offerRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(232,241,245,0.18)',
  },
  offerHighlight: {
    backgroundColor: 'rgba(244,180,96,0.08)',
    paddingHorizontal: 10,
    marginHorizontal: -10,
  },
  offerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  offerRoute: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    color: colors.mist,
  },
  offerPrice: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 22,
    color: colors.sunrise,
  },
  offerMeta: {
    marginTop: 4,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: 'rgba(232,241,245,0.8)',
  },
  offerSoft: {
    marginTop: 2,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: 'rgba(232,241,245,0.55)',
  },
  agentRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(232,241,245,0.14)',
  },
  agentName: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    color: colors.mist,
  },
  agentModel: {
    fontFamily: 'DMSans_400Regular',
    color: 'rgba(232,241,245,0.5)',
  },
  agentReason: {
    marginTop: 4,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(232,241,245,0.78)',
  },
  footnote: {
    marginTop: 18,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: 'rgba(232,241,245,0.5)',
  },
});
