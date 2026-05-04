import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { CollectionStats } from '../components/profile/CollectionStats';
import { QuickActions } from '../components/profile/QuickActions';
import { PlatformSwitcher, PlatformInfo } from '../components/profile/PlatformSwitcher';
import { PaywallSheet } from '../components/subscription/PaywallSheet';
import { UserRepository, UserProfile } from '../libs/repositories/user-repository';
import { router } from 'expo-router';
import { gachaService } from '../libs/services/gacha-service';
import { authService } from '../libs/services/auth/auth-service';
import { PLATFORM_CONFIGS, PlatformType } from '../libs/services/auth/types';
import { useSubscription } from '../context/SubscriptionContext';
import { Colors, FontFamily, Radius, Spacing, Typography } from '../constants/DesignSystem';

const PLATFORM_INITIAL: Record<PlatformType, string> = {
  anilist: 'A',
  myanimelist: 'M',
  bangumi: 'B',
  kitsu: 'K',
  shikimori: 'S',
  simkl: 'S',
  annict: 'N',
  kavita: 'K',
};

const DEFAULT_PLATFORM_ID = '__default__';

export default function ProfileScreen() {
  const { top } = useSafeAreaInsets();
  const subscription = useSubscription();
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [cardsCount, setCardsCount] = useState(0);
  const [coins, setCoins] = useState(0);
  const [shards, setShards] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState<string>(DEFAULT_PLATFORM_ID);
  const [connectedPlatforms, setConnectedPlatforms] = useState<PlatformInfo[]>([]);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const loadConnectedPlatforms = useCallback(async () => {
    try {
      await authService.initialize();
      const creds = authService.getAllCredentials();
      const list: PlatformInfo[] = creds.map((c) => {
        const cfg = PLATFORM_CONFIGS[c.platform];
        return {
          id: c.platform,
          name: cfg?.displayName ?? c.platform,
          color: cfg?.color ?? Colors.accent,
          initial: PLATFORM_INITIAL[c.platform] ?? c.platform.charAt(0).toUpperCase(),
          isConnected: true,
          username: c.username,
          avatarUrl: c.avatarUrl,
        };
      });
      setConnectedPlatforms(list);
    } catch (e) {
      console.error('Error loading connected platforms:', e);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const data = await UserRepository.getProfile();
      setUser(data);

      try {
        const cards = await gachaService.getUserCards();
        const userCoins = await gachaService.getCoins();
        const userShards = await gachaService.getShards();
        setCardsCount(cards.length);
        setCoins(userCoins);
        setShards(userShards);
      } catch (e) {
        console.error('Error loading gacha data:', e);
      }
    } catch (e) {
      console.error('Error loading profile:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadConnectedPlatforms();
    UserRepository.getPrimaryPlatform().then((stored) => {
      if (stored) setSelectedPlatform(stored);
    });
  }, [loadData, loadConnectedPlatforms]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadData(), loadConnectedPlatforms()]);
    setRefreshing(false);
  }, [loadData, loadConnectedPlatforms]);

  const handleSelectPlatform = useCallback((id: string) => {
    setSelectedPlatform(id);
    void UserRepository.setPrimaryPlatform(id);
  }, []);

  const switcherPlatforms = useMemo<PlatformInfo[]>(() => {
    const defaultEntry: PlatformInfo = {
      id: DEFAULT_PLATFORM_ID,
      name: 'Aniseekr',
      color: Colors.primary,
      initial: 'A',
      isConnected: true,
      username: user?.username,
      avatarUrl: user?.avatarUrl,
    };
    return [defaultEntry, ...connectedPlatforms];
  }, [connectedPlatforms, user]);

  const activePlatform = useMemo(() => {
    return switcherPlatforms.find((p) => p.id === selectedPlatform) ?? switcherPlatforms[0];
  }, [switcherPlatforms, selectedPlatform]);

  const headerUsername = activePlatform?.username || user?.username || 'Loading...';
  const headerAvatar = activePlatform?.avatarUrl || user?.avatarUrl || '';

  const defaultStats = {
    totalRated: 0,
    likedCount: 0,
    cardsCount: cardsCount,
    foldersCount: 0,
  };

  const stats = user
    ? {
        ...user.stats,
        cardsCount: cardsCount || user.stats.cardsCount,
      }
    : defaultStats;

  const isPro = subscription.isPro;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Colors.gradients.background as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowOrange} pointerEvents="none" />
      <View style={styles.glowPurple} pointerEvents="none" />
      <SafeAreaView style={[styles.safeArea, { paddingTop: top }]}>
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>Profile</Text>
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              tintColor={Colors.text.primary}
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              progressBackgroundColor={Colors.background.secondary}
            />
          }>
          <ProfileHeader
            username={headerUsername}
            profileImageURL={headerAvatar}
            isDonator={user ? user.isDonator : false}
            coins={coins}
            shards={shards}
          />

          <PlatformSwitcher
            platforms={switcherPlatforms}
            selected={selectedPlatform}
            onSelect={handleSelectPlatform}
          />

          {isPro ? (
            <View style={styles.proPill}>
              <FontAwesome5 name="crown" size={12} color="#000" />
              <Text style={styles.proPillText}>Premium active</Text>
            </View>
          ) : (
            <Pressable onPress={() => setPaywallVisible(true)} style={styles.premiumBanner}>
              <LinearGradient
                colors={Colors.gradients.sunset}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.premiumBannerContent}>
                <View style={styles.premiumBannerText}>
                  <Text style={styles.premiumBannerTitle}>Unlock Premium</Text>
                  <Text style={styles.premiumBannerSubtitle}>
                    No ads, all themes, unlimited sync
                  </Text>
                </View>
                <View style={styles.premiumBannerCta}>
                  <Text style={styles.premiumBannerCtaText}>Upgrade</Text>
                </View>
              </View>
            </Pressable>
          )}

          <CollectionStats stats={stats} />

          <QuickActions
            actions={{
              onPremium: () =>
                isPro ? router.push('/(setting)/account') : setPaywallVisible(true),
              onSync: () => router.push('/(setting)/sync-hub'),
              onSettings: () => router.push('/(setting)/settings'),
              onBackup: () => router.push('/(setting)/import-wizard'),
              onDNA: () => router.push('/(setting)/otaku-dna'),
            }}
          />
        </ScrollView>
      </SafeAreaView>

      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  glowOrange: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: `${Colors.primary}33`,
    opacity: 0.55,
  },
  glowPurple: {
    position: 'absolute',
    top: 160,
    left: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: `${Colors.secondary}33`,
    opacity: 0.4,
  },
  safeArea: {
    flex: 1,
  },
  headerRow: {
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: Spacing.sm,
  },
  screenTitle: {
    ...Typography.headlineLarge,
    color: Colors.text.primary,
    fontFamily: FontFamily.rounded,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  premiumBanner: {
    marginHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.xxl,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glass.borderHeavy,
  },
  premiumBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  premiumBannerText: {
    flex: 1,
  },
  premiumBannerTitle: {
    ...Typography.titleLarge,
    color: '#000',
    fontWeight: '700',
  },
  premiumBannerSubtitle: {
    ...Typography.bodySmall,
    color: 'rgba(0,0,0,0.7)',
    marginTop: 2,
  },
  premiumBannerCta: {
    backgroundColor: '#000',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  premiumBannerCtaText: {
    color: '#FFD60A',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  proPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: '#fbbf24',
    borderRadius: Radius.full,
    marginHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.xxl,
  },
  proPillText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
