// Pilgrimage detail screen.
// Path: /pilgrimage/{bangumiId}
//
// Spec: spec/pilgrimage_spec.md §8 (Routes).

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import { anitabiService } from '../../libs/services/pilgrimage/anitabi-service';
import type {
  AnitabiBangumi,
  AnitabiPoint,
  AnitabiPointDetail,
} from '../../libs/services/pilgrimage/types';
import {
  PilgrimageSpotList,
  buildMapsURL,
  hasValidGeo,
} from '../../components/pilgrimage/PilgrimageSpotList';

export default function PilgrimageDetailScreen() {
  const { animeId } = useLocalSearchParams<{ animeId: string }>();
  const router = useRouter();
  const bangumiId = Number(animeId);

  const [anime, setAnime] = useState<AnitabiBangumi | null>(null);
  const [points, setPoints] = useState<readonly AnitabiPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!Number.isFinite(bangumiId) || bangumiId <= 0) {
      setError('Invalid anime id');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    pilgrimageRepository
      .getSpotsByBangumiId(bangumiId)
      .then(async (lite) => {
        if (cancelled) return;
        if (!lite) {
          setError('No pilgrimage data for this anime.');
          setLoading(false);
          return;
        }
        setAnime(lite);
        setPoints(lite.litePoints ?? []);

        // Lazy-load the full detail set on top of the lite data.
        try {
          const detailed: AnitabiPointDetail[] = await anitabiService.getDetailedPoints(bangumiId);
          if (!cancelled && detailed.length > 0) {
            setPoints(detailed);
          }
        } catch {
          // Lite data is enough; ignore.
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load pilgrimage';
        setError(message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bangumiId]);

  const onOpenCenter = () => {
    if (!anime) return;
    const [lat, lng] = anime.geo ?? [0, 0];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
    Linking.openURL(buildMapsURL(lat, lng)).catch(() => undefined);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: anime?.title ?? 'Pilgrimage',
          headerLargeTitle: false,
        }}
      />
      <View style={styles.container}>
        <LinearGradient colors={['#121212', '#1E1E1E']} style={StyleSheet.absoluteFill} />

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : error ? (
          <SafeAreaView style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Go back</Text>
            </Pressable>
          </SafeAreaView>
        ) : anime ? (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.header}>
              <Image
                source={{ uri: (anime.cover ?? '').replace('?plan=h160', '?plan=h360') }}
                style={styles.cover}
                contentFit="cover"
                transition={200}
              />
              <LinearGradient
                colors={['transparent', 'rgba(18,18,18,0.95)']}
                style={styles.coverGradient}
              />
              <View style={styles.headerContent}>
                <Text style={styles.headerTitle} numberOfLines={2}>
                  {anime.title}
                </Text>
                {anime.cn ? (
                  <Text style={styles.headerSubtitle} numberOfLines={1}>
                    {anime.cn}
                  </Text>
                ) : null}
                <View style={styles.headerMeta}>
                  {anime.city ? (
                    <View style={styles.metaTag}>
                      <Ionicons name="location" size={12} color="#FFFFFF" />
                      <Text style={styles.metaText}>{anime.city}</Text>
                    </View>
                  ) : null}
                  <View style={styles.metaTag}>
                    <Ionicons name="pin" size={12} color="#FFFFFF" />
                    <Text style={styles.metaText}>
                      {anime.pointsLength} {anime.pointsLength === 1 ? 'spot' : 'spots'}
                    </Text>
                  </View>
                </View>

                {hasValidGeo({
                  id: '',
                  name: '',
                  image: '',
                  ep: 0,
                  s: 0,
                  geo: anime.geo,
                }) ? (
                  <Pressable
                    style={styles.viewMapBtn}
                    onPress={onOpenCenter}
                    accessibilityRole="button">
                    <Ionicons name="map-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.viewMapText}>
                      View on {Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <PilgrimageSpotList points={points} />
          </ScrollView>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  backBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: { color: '#FFFFFF', fontWeight: '600' },
  scroll: { paddingBottom: 32 },
  header: { position: 'relative' },
  cover: { width: '100%', height: 240, backgroundColor: '#1B1B1D' },
  coverGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 160 },
  headerContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  headerSubtitle: { color: '#A3A3A3', fontSize: 14, marginBottom: 12 },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  metaText: { color: '#FFFFFF', fontSize: 12, fontWeight: '500' },
  viewMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  viewMapText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
