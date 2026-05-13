import { View, ScrollView, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { router } from 'expo-router';
import { PlatformSwitcher, PlatformInfo } from '../../components/profile/PlatformSwitcher';
import { EditDisplayNameSheet } from '../../components/profile/EditDisplayNameSheet';
import { ProfileShortcutsGrid } from '../../components/profile/ProfileShortcutsGrid';
import { PaywallSheet } from '../../components/subscription/PaywallSheet';
import { ThemedText, ThemedSurface, readableTextOn, Skeleton } from '../../components/themed';
import { UserRepository, UserProfile } from '../../libs/repositories/user-repository';
import { gachaService } from '../../libs/services/gacha-service';
import { authService } from '../../libs/services/auth/auth-service';
import { PLATFORM_CONFIGS, PlatformType } from '../../libs/services/auth/types';
import {
  DEFAULT_USER_PREFS,
  loadUserPrefs,
  patchUserPrefs,
} from '../../libs/services/user-prefs';
import {
  normalizeProfileShortcuts,
  type ShortcutId,
} from '../../libs/services/profile-shortcuts';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTheme } from '../../context/ThemeContext';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

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
  const { theme } = useTheme();
  const subscription = useSubscription();
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [cardsCount, setCardsCount] = useState(0);
  const [coins, setCoins] = useState(0);
  const [shards, setShards] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState<string>(DEFAULT_PLATFORM_ID);
  const [connectedPlatforms, setConnectedPlatforms] = useState<PlatformInfo[]>([]);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [nameSheetVisible, setNameSheetVisible] = useState(false);
  const [shortcuts, setShortcuts] = useState<ShortcutId[]>(
    DEFAULT_USER_PREFS.profileShortcuts,
  );

  const loadConnectedPlatforms = useCallback(async () => {
    try {
      await authService.initialize();
      const creds = authService.getAllCredentials();
      const list: PlatformInfo[] = creds.map((c) => {
        const cfg = PLATFORM_CONFIGS[c.platform];
        return {
          id: c.platform,
          name: cfg?.displayName ?? c.platform,
          color: cfg?.color ?? theme.accent,
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
  }, [theme.accent]);

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
    let mounted = true;
    loadData();
    loadConnectedPlatforms();
    UserRepository.getPrimaryPlatform().then((stored) => {
      if (mounted && stored) setSelectedPlatform(stored);
    });
    loadUserPrefs().then((p) => {
      if (mounted) setShortcuts(normalizeProfileShortcuts(p.profileShortcuts));
    });
    return () => {
      mounted = false;
    };
  }, [loadData, loadConnectedPlatforms]);

  const handleShortcutsChange = useCallback((next: ShortcutId[]) => {
    setShortcuts(next);
    void patchUserPrefs({ profileShortcuts: next });
  }, []);

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
      color: theme.accent,
      initial: 'A',
      isConnected: true,
      username: user?.username,
      avatarUrl: user?.avatarUrl,
    };
    return [defaultEntry, ...connectedPlatforms];
  }, [connectedPlatforms, user, theme.accent]);

  const activePlatform = useMemo(() => {
    return switcherPlatforms.find((p) => p.id === selectedPlatform) ?? switcherPlatforms[0];
  }, [switcherPlatforms, selectedPlatform]);

  const headerUsername = activePlatform?.username || user?.username || 'Anime fan';
  const headerAvatar = activePlatform?.avatarUrl || user?.avatarUrl || '';
  const isEditable = selectedPlatform === DEFAULT_PLATFORM_ID;

  const stats = user?.stats ?? {
    totalRated: 0,
    likedCount: 0,
    cardsCount,
    foldersCount: 0,
  };
  const watchedValue = cardsCount || stats.cardsCount;
  const ratedValue = stats.totalRated;
  const likedValue = stats.likedCount;

  const isPro = subscription.isPro;
  const ctaFg = readableTextOn(theme.accent);
  const upgradeBtnBg = theme.background.primary;

  const handleEditName = () => {
    if (!isEditable) return;
    hapticsBridge.tap();
    setNameSheetVisible(true);
  };

  const handleOpenSettings = () => {
    hapticsBridge.tap();
    router.push('/(setting)/settings');
  };

  const handleOpenPremium = () => {
    hapticsBridge.tap();
    if (isPro) router.push('/(setting)/account');
    else setPaywallVisible(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.headerRow, { paddingTop: Math.max(top * 0.25, Spacing.xs) }]}>
          <ThemedText variant="headlineLarge">Profile</ThemedText>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              tintColor={theme.text.primary}
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.accent]}
              progressBackgroundColor={theme.background.secondary}
            />
          }>
          {/* Profile Card */}
          {user === null && !refreshing ? (
            <Skeleton.Profile />
          ) : (
            <ThemedSurface
              variant="card"
              radius={Radius.card}
              style={[styles.profileCard, { borderColor: theme.glassBorder }]}>
              <View
                style={[
                  styles.avatarRing,
                  {
                    backgroundColor: theme.background.primary,
                    borderColor: theme.accent,
                  },
                ]}>
                {headerAvatar ? (
                  <Image source={{ uri: headerAvatar }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={36} color={theme.accent} />
                )}
              </View>

              <Pressable
                onPress={handleEditName}
                disabled={!isEditable}
                style={({ pressed }) => [
                  styles.nameRow,
                  pressed && isEditable && { opacity: 0.7 },
                ]}>
                <ThemedText variant="titleLarge" weight="700">
                  {headerUsername}
                </ThemedText>
                {isEditable ? (
                  <MaterialIcons name="edit" size={16} color={theme.text.tertiary} />
                ) : null}
                {isPro ? (
                  <View style={[styles.proBadge, { backgroundColor: theme.accent }]}>
                    <FontAwesome5 name="crown" size={10} color={ctaFg} />
                    <ThemedText
                      variant="captionSmall"
                      weight="800"
                      style={[styles.proBadgeText, { color: ctaFg }]}>
                      PRO
                    </ThemedText>
                  </View>
                ) : null}
              </Pressable>

              <View
                style={[
                  styles.currencyPill,
                  {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                  },
                ]}>
                <View style={styles.currencyItem}>
                  <MaterialIcons name="monetization-on" size={16} color="#FFD60A" />
                  <ThemedText variant="bodyMedium" weight="600">
                    {coins}
                  </ThemedText>
                </View>
                <View style={[styles.currencyDivider, { backgroundColor: theme.glassBorder }]} />
                <View style={styles.currencyItem}>
                  <MaterialIcons name="diamond" size={16} color="#06B6D4" />
                  <ThemedText variant="bodyMedium" weight="600">
                    {shards}
                  </ThemedText>
                </View>
              </View>
            </ThemedSurface>
          )}

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <StatTile value={watchedValue} label="Cards" />
            <StatTile value={ratedValue} label="Rated" />
            <StatTile value={likedValue} label="Liked" />
          </View>

          {/* Premium CTA */}
          <Pressable
            onPress={handleOpenPremium}
            style={({ pressed }) => [styles.premiumCta, pressed && { opacity: 0.92 }]}>
            <LinearGradient
              colors={[theme.accent, theme.accentDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.premiumCtaContent}>
              <View style={styles.premiumCtaText}>
                <View style={styles.premiumTitleRow}>
                  <Ionicons name="sparkles" size={16} color={ctaFg} />
                  <ThemedText
                    variant="titleMedium"
                    weight="700"
                    style={[styles.premiumTitle, { color: ctaFg }]}>
                    {isPro ? 'Premium active' : 'Unlock Premium'}
                  </ThemedText>
                </View>
                <ThemedText
                  variant="bodySmall"
                  style={[styles.premiumSubtitle, { color: ctaFg, opacity: 0.85 }]}>
                  {isPro
                    ? 'Manage your subscription and benefits'
                    : 'No ads, all themes, unlimited sync'}
                </ThemedText>
              </View>
              <View style={[styles.upgradePill, { backgroundColor: upgradeBtnBg }]}>
                <ThemedText
                  variant="titleSmall"
                  weight="700"
                  style={{ color: theme.text.primary }}>
                  {isPro ? 'Manage' : 'Upgrade'}
                </ThemedText>
              </View>
            </View>
          </Pressable>

          {/* Quick Shortcuts */}
          <ProfileShortcutsGrid shortcuts={shortcuts} onChange={handleShortcutsChange} />

          {/* Settings Row */}
          <Pressable
            onPress={handleOpenSettings}
            style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
            <ThemedSurface
              variant="card"
              radius={Radius.lg}
              style={[styles.settingsRow, { borderColor: theme.glassBorder }]}>
              <View
                style={[
                  styles.settingsIconWrap,
                  { backgroundColor: theme.background.tertiary },
                ]}>
                <Ionicons name="settings-outline" size={18} color={theme.text.primary} />
              </View>
              <View style={styles.settingsLabel}>
                <ThemedText variant="titleSmall" weight="600">
                  Settings
                </ThemedText>
                <ThemedText variant="bodySmall" tone="tertiary">
                  Preferences, account, more
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.text.secondary} />
            </ThemedSurface>
          </Pressable>

          {connectedPlatforms.length > 0 ? (
            <View style={styles.platformsSection}>
              <PlatformSwitcher
                platforms={switcherPlatforms}
                selected={selectedPlatform}
                onSelect={handleSelectPlatform}
              />
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
      <EditDisplayNameSheet
        visible={nameSheetVisible}
        currentName={user?.username ?? ''}
        onClose={() => setNameSheetVisible(false)}
        onSave={async (name) => {
          await UserRepository.setDisplayName(name);
          await loadData();
        }}
      />
    </View>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  const { theme } = useTheme();
  return (
    <ThemedSurface
      variant="card"
      radius={Radius.lg}
      style={[styles.statTile, { borderColor: theme.glassBorder }]}>
      <ThemedText variant="headlineSmall" weight="700">
        {value}
      </ThemedText>
      <ThemedText variant="bodySmall" tone="secondary" weight="500">
        {label}
      </ThemedText>
    </ThemedSurface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  headerRow: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 120,
    gap: Spacing.md,
  },
  profileCard: {
    alignItems: 'center',
    gap: Spacing.sm + 2,
    padding: Spacing.xl,
  },
  avatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.full,
    marginLeft: Spacing.xxs,
  },
  proBadgeText: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.xs,
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  currencyDivider: {
    width: 1,
    height: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm - 2,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  premiumCta: {
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  premiumCtaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    padding: Spacing.md + 2,
  },
  premiumCtaText: {
    flex: 1,
    gap: 4,
  },
  premiumTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  premiumTitle: {
    fontWeight: '700',
  },
  premiumSubtitle: {
    fontWeight: '500',
  },
  upgradePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    padding: Spacing.md + 2,
  },
  settingsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: {
    flex: 1,
    gap: 2,
  },
  platformsSection: {
    marginTop: Spacing.xs,
    marginHorizontal: -Spacing.screenPadding,
  },
});
