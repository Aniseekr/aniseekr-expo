import {
  Alert,
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Radius, Spacing, Size } from '../../constants/DesignSystem';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTheme, type ThemeId, type ThemeMode } from '../../context/ThemeContext';
import { PaywallSheet } from '../../components/subscription/PaywallSheet';
import { EditDisplayNameSheet } from '../../components/profile/EditDisplayNameSheet';
import {
  SettingsHeader,
  SettingsSection,
  SettingsRow,
  SettingsSwitchRow,
} from '../../components/settings/SettingsList';
import {
  QuickActionSheet,
  type QuickAction,
} from '../../components/settings/QuickActionSheet';
import { ThemedText, readableTextOn } from '../../components/themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  loadUserPrefsSync,
  patchUserPrefs,
  subscribeUserPrefs,
  type UserPrefs,
} from '../../libs/services/user-prefs';
import { UserRepository, type UserProfile } from '../../libs/repositories/user-repository';
import { authService } from '../../libs/services/auth/auth-service';

interface PurchasesShowManage {
  default: { showManageSubscriptions: () => Promise<void> };
}

async function openManageSubscription(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases') as PurchasesShowManage;
    if (mod?.default?.showManageSubscriptions) {
      await mod.default.showManageSubscriptions();
      return;
    }
  } catch {
    // fall through to URL fallback
  }
  await Linking.openURL('https://apps.apple.com/account/subscriptions').catch(
    () => undefined,
  );
}

type QuickSheetKind =
  | 'appearance'
  | 'theme'
  | 'themeMode'
  | 'accent'
  | 'platforms'
  | 'premium'
  | null;

const THEME_MODE_LABEL: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  auto: 'Auto',
};

const PRESET_ACCENTS: { hex: string; name: string }[] = [
  { hex: '#FF9F0A', name: 'Aniseekr Orange' },
  { hex: '#FF2A6D', name: 'Cyber Pink' },
  { hex: '#5E5CE6', name: 'Midnight Indigo' },
  { hex: '#10B981', name: 'Forest Green' },
  { hex: '#0A84FF', name: 'Ocean Blue' },
  { hex: '#BF5AF2', name: 'Candy Purple' },
];

export default function SettingsScreen() {
  const { top } = useSafeAreaInsets();
  const subscription = useSubscription();
  const {
    theme,
    themeId,
    themeMode,
    customAccent,
    setTheme,
    setThemeMode,
    setCustomAccent,
    themes,
  } = useTheme();

  const [prefs, setPrefs] = useState<UserPrefs>(loadUserPrefsSync);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [nameSheetVisible, setNameSheetVisible] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [connectedCount, setConnectedCount] = useState(0);
  const [activeSheet, setActiveSheet] = useState<QuickSheetKind>(null);

  const appVersion =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    // Prefs are seeded synchronously above; the subscription below catches
    // any subsequent edits made on other settings screens.
    const unsub = subscribeUserPrefs(setPrefs);
    return unsub;
  }, []);

  // Re-read profile + connected platform count whenever this screen regains
  // focus (e.g. coming back from /account after connecting/disconnecting).
  // Per CLAUDE.md Rule 10: silent revalidation — don't clear state, don't
  // flash a loading skeleton. We just overwrite when the fresh values land.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const next = await UserRepository.getProfile();
          if (!cancelled) setUser(next);
        } catch {
          // ignore — keep showing whatever we last had
        }
        try {
          await authService.initialize();
          if (cancelled) return;
          setConnectedCount(authService.getAllCredentials().length);
        } catch {
          // ignore
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const updatePref = async <K extends keyof UserPrefs>(
    key: K,
    value: UserPrefs[K],
  ): Promise<void> => {
    const next = await patchUserPrefs({ [key]: value } as Partial<UserPrefs>);
    setPrefs(next);
  };

  const handleAdultToggle = async (nextOn: boolean) => {
    if (!nextOn) {
      await updatePref('allowAdultContent', false);
      return;
    }
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hasHw && (await LocalAuthentication.isEnrolledAsync());
    if (enrolled) {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to enable adult content',
        cancelLabel: 'Cancel',
      });
      if (res.success) await updatePref('allowAdultContent', true);
      return;
    }
    Alert.alert(
      'Enable adult content?',
      'Are you sure you want to enable adult content?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Enable',
          style: 'destructive',
          onPress: () => {
            void updatePref('allowAdultContent', true);
          },
        },
      ],
    );
  };

  const isPro = subscription.isPro;
  const ctaFg = readableTextOn(theme.accent);
  const upgradeBtnBg = theme.background.primary;

  const activeThemeName = useMemo(() => {
    const found = themes.find((t) => t.id === themeId);
    return found?.name ?? 'Aniseekr';
  }, [themes, themeId]);

  const activeAccentHex = customAccent ?? theme.accent;

  const themeActions: QuickAction[] = useMemo(
    () =>
      themes.map((t) => ({
        key: t.id,
        label: t.name,
        description: t.isPremium && !isPro ? 'Premium only' : undefined,
        icon: 'color-palette-outline',
        selected: t.id === themeId,
        onPress: () => {
          if (t.isPremium && !isPro) {
            setPaywallVisible(true);
            return;
          }
          void setTheme(t.id as ThemeId);
        },
      })),
    [themes, themeId, isPro, setTheme],
  );

  const themeModeActions: QuickAction[] = useMemo(
    () => [
      {
        key: 'light',
        label: 'Light',
        icon: 'sunny-outline',
        selected: themeMode === 'light',
        onPress: () => void setThemeMode('light'),
      },
      {
        key: 'dark',
        label: 'Dark',
        icon: 'moon-outline',
        selected: themeMode === 'dark',
        onPress: () => void setThemeMode('dark'),
      },
      {
        key: 'auto',
        label: 'Auto',
        description: 'Follow system appearance',
        icon: 'contrast-outline',
        selected: themeMode === 'auto',
        onPress: () => void setThemeMode('auto'),
      },
    ],
    [themeMode, setThemeMode],
  );

  const accentActions: QuickAction[] = useMemo(() => {
    const actions: QuickAction[] = PRESET_ACCENTS.map((p) => ({
      key: p.hex,
      label: p.name,
      description: p.hex.toUpperCase(),
      icon: 'ellipse',
      selected: activeAccentHex.toUpperCase() === p.hex.toUpperCase(),
      onPress: () => void setCustomAccent(p.hex),
    }));
    if (customAccent) {
      actions.push({
        key: 'reset',
        label: 'Reset to theme default',
        icon: 'refresh-outline',
        onPress: () => void setCustomAccent(null),
      });
    }
    actions.push({
      key: 'open-picker',
      label: 'Open full picker…',
      icon: 'color-wand-outline',
      onPress: () => router.push('/(setting)/accent-color'),
    });
    return actions;
  }, [activeAccentHex, customAccent, setCustomAccent]);

  const platformActions: QuickAction[] = useMemo(
    () => [
      {
        key: 'manage',
        label: 'Manage platforms',
        description: 'Connect or disconnect accounts',
        icon: 'link-outline',
        onPress: () => router.push('/(setting)/account'),
      },
      {
        key: 'sync-now',
        label: 'Sync now',
        description: 'Pull the latest from connected sources',
        icon: 'refresh-circle-outline',
        onPress: () => {
          void UserRepository.syncAllPlatforms();
          hapticsBridge.success();
        },
      },
      {
        key: 'import',
        label: 'Import wizard',
        icon: 'cloud-upload-outline',
        onPress: () => router.push('/(setting)/import-wizard'),
      },
    ],
    [],
  );

  const appearanceActions: QuickAction[] = useMemo(() => {
    const modeRows: QuickAction[] = (
      [
        { key: 'light', label: 'Light', icon: 'sunny-outline' as const, mode: 'light' as ThemeMode },
        { key: 'dark', label: 'Dark', icon: 'moon-outline' as const, mode: 'dark' as ThemeMode },
        { key: 'auto', label: 'Auto', icon: 'contrast-outline' as const, mode: 'auto' as ThemeMode },
      ]
    ).map((m) => ({
      key: `mode-${m.key}`,
      label: m.label,
      description: m.key === 'auto' ? 'Follow system appearance' : 'Theme mode',
      icon: m.icon,
      selected: themeMode === m.mode,
      onPress: () => void setThemeMode(m.mode),
    }));

    const accentRows: QuickAction[] = PRESET_ACCENTS.slice(0, 4).map((p) => ({
      key: `accent-${p.hex}`,
      label: p.name,
      description: 'Accent color',
      icon: 'ellipse',
      selected: activeAccentHex.toUpperCase() === p.hex.toUpperCase(),
      onPress: () => void setCustomAccent(p.hex),
    }));

    return [
      ...modeRows,
      ...accentRows,
      {
        key: 'open-theme',
        label: 'Switch theme…',
        description: `Currently ${activeThemeName}`,
        icon: 'color-palette-outline',
        onPress: () => setActiveSheet('theme'),
      },
      {
        key: 'open-appearance',
        label: 'Open full appearance',
        icon: 'open-outline',
        onPress: () => router.push('/(setting)/appearance'),
      },
    ];
  }, [
    themeMode,
    setThemeMode,
    activeAccentHex,
    setCustomAccent,
    activeThemeName,
  ]);

  const premiumActions: QuickAction[] = useMemo(() => {
    if (isPro) {
      return [
        {
          key: 'manage',
          label: 'Manage subscription',
          icon: 'card-outline',
          onPress: () => void openManageSubscription(),
        },
      ];
    }
    return [
      {
        key: 'upgrade',
        label: 'Upgrade now',
        description: 'Unlock themes, sync, no ads',
        icon: 'sparkles-outline',
        onPress: () => setPaywallVisible(true),
      },
      {
        key: 'restore',
        label: 'Restore purchases',
        icon: 'refresh-outline',
        onPress: () => {
          void subscription.restore?.();
        },
      },
    ];
  }, [isPro, subscription]);

  const sheetConfig = useMemo(() => {
    switch (activeSheet) {
      case 'appearance':
        return {
          title: 'Appearance',
          subtitle: `${activeThemeName} · ${THEME_MODE_LABEL[themeMode]}`,
          actions: appearanceActions,
        };
      case 'theme':
        return {
          title: 'Theme',
          subtitle: 'Tap to switch · long-press a row anywhere to open quick actions',
          actions: themeActions,
        };
      case 'themeMode':
        return {
          title: 'Theme mode',
          subtitle: 'Choose how surfaces respond to system appearance',
          actions: themeModeActions,
        };
      case 'accent':
        return {
          title: 'Accent color',
          subtitle: 'Pick a preset or open the full picker',
          actions: accentActions,
        };
      case 'platforms':
        return {
          title: 'Connected platforms',
          subtitle: `${connectedCount} connected`,
          actions: platformActions,
        };
      case 'premium':
        return {
          title: isPro ? 'Premium' : 'Aniseekr Premium',
          subtitle: isPro
            ? 'Manage your subscription'
            : 'Unlock all themes, sync, no ads',
          actions: premiumActions,
        };
      default:
        return null;
    }
  }, [
    activeSheet,
    appearanceActions,
    themeActions,
    themeModeActions,
    accentActions,
    platformActions,
    premiumActions,
    connectedCount,
    isPro,
    activeThemeName,
    themeMode,
  ]);

  const handleSaveName = useCallback(async (name: string) => {
    await UserRepository.setDisplayName(name);
    const next = await UserRepository.getProfile();
    setUser(next);
  }, []);

  const displayName = user?.username ?? 'Anime fan';
  const avatarUri = user?.avatarUrl ?? '';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={[styles.safeArea, { paddingTop: top }]}>
        <SettingsHeader
          title="Settings"
          subtitle="Long-press a row for quick actions"
          onBack={() => router.back()}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* User header card */}
          <Pressable
            onPress={() => setNameSheetVisible(true)}
            onLongPress={() => {
              hapticsBridge.longPress();
              setNameSheetVisible(true);
            }}
            style={({ pressed }) => [pressed && { opacity: 0.92 }]}
            accessibilityRole="button"
            accessibilityLabel="Edit profile name">
            <View
              style={[
                styles.userCard,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <LinearGradient
                colors={[theme.accent, theme.accentDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatar}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <ThemedText
                    variant="titleMedium"
                    weight="800"
                    style={{ color: ctaFg }}>
                    {initials || 'A'}
                  </ThemedText>
                )}
              </LinearGradient>

              <View style={styles.userInfo}>
                <View style={styles.nameRow}>
                  <ThemedText variant="titleLarge" weight="700" numberOfLines={1}>
                    {displayName}
                  </ThemedText>
                  {isPro ? (
                    <View style={[styles.proBadge, { backgroundColor: theme.accent }]}>
                      <ThemedText
                        variant="captionSmall"
                        weight="800"
                        style={[styles.proBadgeText, { color: ctaFg }]}>
                        PRO
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>

              <View
                style={[
                  styles.editPill,
                  { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
                ]}>
                <ThemedText variant="captionSmall" weight="700">
                  Edit
                </ThemedText>
              </View>
            </View>
          </Pressable>

          {/* Premium hero */}
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              if (isPro) void openManageSubscription();
              else setPaywallVisible(true);
            }}
            onLongPress={() => {
              hapticsBridge.longPress();
              setActiveSheet('premium');
            }}
            style={({ pressed }) => [styles.premiumHeroWrap, pressed && { opacity: 0.92 }]}
            accessibilityRole="button"
            accessibilityLabel={isPro ? 'Manage subscription' : 'Upgrade to Premium'}>
            <LinearGradient
              colors={[theme.accent, theme.accentDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.premiumHero}>
              <View style={styles.premiumHeroLeft}>
                <Ionicons name="sparkles" size={22} color={ctaFg} />
                <View style={styles.premiumTextWrap}>
                  <ThemedText
                    variant="titleMedium"
                    weight="700"
                    style={{ color: ctaFg }}>
                    {isPro ? 'Premium active' : 'Unlock Premium'}
                  </ThemedText>
                  <ThemedText
                    variant="bodySmall"
                    style={{ color: ctaFg, opacity: 0.85 }}>
                    {isPro
                      ? 'Manage your subscription and benefits'
                      : 'No ads, all themes, unlimited sync'}
                  </ThemedText>
                </View>
              </View>
              <View
                style={[styles.upgradePill, { backgroundColor: upgradeBtnBg }]}>
                <ThemedText variant="titleSmall" weight="700">
                  {isPro ? 'Manage' : 'Upgrade'}
                </ThemedText>
              </View>
            </LinearGradient>
          </Pressable>

          <SettingsSection title="ACCOUNT">
            <SettingsRow
              icon="people-circle-outline"
              label="Connected platforms"
              value={
                connectedCount > 0
                  ? `${connectedCount} connected`
                  : 'None'
              }
              onPress={() => router.push('/(setting)/account')}
              onLongPress={() => setActiveSheet('platforms')}
            />
            <SettingsRow
              icon="trophy-outline"
              label="Achievements"
              onPress={() => router.push('/(setting)/achievements')}
            />
          </SettingsSection>

          <SettingsSection title="CONTENT & SYNC">
            <SettingsRow
              icon="cloud-outline"
              label="Browse source"
              onPress={() => router.push('/(setting)/data-source')}
            />
            <SettingsRow
              icon="play-circle-outline"
              label="Watch platforms"
              description={
                prefs.streamingPlatforms.enabled.length > 0
                  ? `${prefs.streamingPlatforms.enabled.length} enabled · primary: ${prefs.streamingPlatforms.primary ?? 'none'}`
                  : 'Pick where you watch (Netflix, Bahamut, Crunchyroll…)'
              }
              onPress={() => router.push('/(setting)/watch-platforms')}
            />
            <SettingsRow
              icon="server-outline"
              label="Cache"
              onPress={() => router.push('/(setting)/cache')}
            />
            <SettingsRow
              icon="cloud-upload-outline"
              label="Backup & Restore"
              description="iCloud · Google Drive · import old aniseeker data"
              onPress={() => router.push('/(setting)/backup')}
            />
          </SettingsSection>

          <SettingsSection title="APPEARANCE">
            <SettingsRow
              icon="color-palette-outline"
              label="Appearance"
              description={`${activeThemeName} · ${THEME_MODE_LABEL[themeMode]}`}
              right={
                <View
                  style={[
                    styles.accentSwatch,
                    { backgroundColor: activeAccentHex, borderColor: theme.glassBorder },
                  ]}
                />
              }
              onPress={() => router.push('/(setting)/appearance')}
              onLongPress={() => setActiveSheet('appearance')}
            />
          </SettingsSection>

          <SettingsSection title="PREFERENCES">
            <SettingsSwitchRow
              icon="warning-outline"
              label="Allow R18 content"
              description="Show 18+ entries in seasonal lists and search"
              value={prefs.allowAdultContent}
              onValueChange={handleAdultToggle}
            />
            <SettingsSwitchRow
              icon="game-controller-outline"
              label="Include games"
              description="Show video games in Bangumi calendar"
              value={prefs.bangumiIncludeGames}
              onValueChange={(v) => void updatePref('bangumiIncludeGames', v)}
            />
            <SettingsSwitchRow
              icon="star-outline"
              label="Show score prominently"
              description="Display rating in card header"
              value={prefs.bangumiShowScoreProminently}
              onValueChange={(v) => void updatePref('bangumiShowScoreProminently', v)}
            />
          </SettingsSection>

          <SettingsSection title="NOTIFICATIONS & ABOUT">
            <SettingsRow
              icon="notifications-outline"
              label="Reminders"
              onPress={() => router.push('/(setting)/notifications')}
            />
            <SettingsRow
              icon="ribbon-outline"
              label="Attribution"
              onPress={() => router.push('/(setting)/attribution')}
            />
            <SettingsRow
              icon="lock-closed-outline"
              label="Privacy policy"
              onPress={() => router.push('/(setting)/privacy')}
            />
            <SettingsRow
              icon="document-text-outline"
              label="Terms of service"
              onPress={() => router.push('/(setting)/terms')}
            />
          </SettingsSection>

          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              router.push('/(setting)/advanced');
            }}
            onLongPress={() => {
              hapticsBridge.longPress();
              router.push('/(setting)/design-tokens');
            }}
            delayLongPress={500}
            style={styles.versionRow}
            accessibilityRole="button"
            accessibilityLabel="App version. Tap to open advanced settings.">
            <ThemedText
              variant="caption"
              tone="tertiary"
              align="center">
              Aniseekr v{appVersion} (Expo)
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
      <EditDisplayNameSheet
        visible={nameSheetVisible}
        currentName={user?.username ?? ''}
        onClose={() => setNameSheetVisible(false)}
        onSave={handleSaveName}
      />

      {sheetConfig ? (
        <QuickActionSheet
          visible={activeSheet !== null}
          onClose={() => setActiveSheet(null)}
          title={sheetConfig.title}
          subtitle={sheetConfig.subtitle}
          actions={sheetConfig.actions}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 120,
    paddingTop: Spacing.xs,
    gap: Spacing.md,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    padding: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  proBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  proBadgeText: {
    letterSpacing: 1,
  },
  editPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.chip,
    borderWidth: 1,
  },
  premiumHeroWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  premiumHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  premiumHeroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    flex: 1,
  },
  premiumTextWrap: {
    flex: 1,
    gap: 2,
  },
  upgradePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
  },
  accentSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
  },
  versionRow: {
    marginTop: Spacing.md,
    minHeight: Size.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
});
