import {
  Alert,
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { useSubscription } from '../../context/SubscriptionContext';
import { PaywallSheet } from '../../components/subscription/PaywallSheet';
import {
  DEFAULT_USER_PREFS,
  loadUserPrefs,
  patchUserPrefs,
  type UserPrefs,
} from '../../libs/services/user-prefs';

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
    // ignore — fall back to URL
  }
  const url = 'https://apps.apple.com/account/subscriptions';
  await Linking.openURL(url).catch(() => undefined);
}

export default function SettingsScreen() {
  const { top } = useSafeAreaInsets();
  const subscription = useSubscription();
  const [dataSaver, setDataSaver] = useState(false);
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_USER_PREFS);
  const [paywallVisible, setPaywallVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadUserPrefs().then((p) => {
      if (mounted) setPrefs(p);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const updatePref = async <K extends keyof UserPrefs>(
    key: K,
    value: UserPrefs[K]
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
      if (res.success) {
        await updatePref('allowAdultContent', true);
      }
      return;
    }
    Alert.alert('Enable adult content?', 'Are you sure you want to enable adult content?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Enable',
        style: 'destructive',
        onPress: () => {
          void updatePref('allowAdultContent', true);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Colors.gradients.background as [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={[styles.safeArea, { paddingTop: top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={Colors.text.primary} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Settings</Text>
            <Text style={styles.headerSubtitle}>Your account & preferences</Text>
          </View>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Premium hero */}
          {subscription.isPro ? (
            <View style={styles.premiumActiveCard}>
              <View style={styles.premiumActiveRow}>
                <View style={styles.premiumActiveLeft}>
                  <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                  <View>
                    <Text style={styles.premiumActiveTitle}>Premium active</Text>
                    <Text style={styles.premiumActiveSubtitle}>
                      Thanks for supporting Aniseekr.
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => {
                    void openManageSubscription();
                  }}
                  style={({ pressed }) => [styles.manageButton, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.manageButtonText}>Manage</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setPaywallVisible(true)}
              style={({ pressed }) => [styles.premiumHeroWrap, pressed && { opacity: 0.92 }]}>
              <LinearGradient
                colors={['#FF9900', '#CC5500']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.premiumHero}>
                <View style={styles.premiumHeroLeft}>
                  <View style={styles.premiumIconBubble}>
                    <Ionicons name="sparkles" size={20} color="#fff" />
                  </View>
                  <View>
                    <Text style={styles.premiumHeroTitle}>Aniseekr Premium</Text>
                    <Text style={styles.premiumHeroSubtitle}>Unlock everything</Text>
                  </View>
                </View>
                <View style={styles.premiumCta}>
                  <Text style={styles.premiumCtaText}>Upgrade</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </View>
              </LinearGradient>
            </Pressable>
          )}

          {/* Account */}
          <View>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.card}>
              <SettingItem
                label="Connected platforms"
                icon="people-circle-outline"
                onPress={() => router.push('/(setting)/account')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Otaku DNA"
                icon="finger-print-outline"
                onPress={() => router.push('/(setting)/otaku-dna')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Achievements"
                icon="trophy-outline"
                onPress={() => router.push('/(setting)/achievements')}
              />
            </View>
          </View>

          {/* Appearance */}
          <View>
            <Text style={styles.sectionTitle}>Appearance</Text>
            <View style={styles.card}>
              <SettingItem
                label="Theme"
                icon="color-palette-outline"
                onPress={() => router.push('/(setting)/theme')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Theme mode"
                icon="contrast-outline"
                onPress={() => router.push('/(setting)/theme-mode')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Accent color"
                icon="color-fill-outline"
                onPress={() => router.push('/(setting)/accent-color')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Live preview"
                icon="eye-outline"
                onPress={() => router.push('/(setting)/theme-preview')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Design tokens"
                icon="grid-outline"
                onPress={() => router.push('/(setting)/design-tokens')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Title language priority"
                icon="language-outline"
                onPress={() => router.push('/(setting)/language-priority')}
              />
            </View>
          </View>

          {/* Sync & Data */}
          <View>
            <Text style={styles.sectionTitle}>Sync & Data</Text>
            <View style={styles.card}>
              <SettingItem
                label="Browse source"
                icon="cloud-outline"
                onPress={() => router.push('/(setting)/data-source')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Sync hub"
                icon="git-branch-outline"
                onPress={() => router.push('/(setting)/sync-hub')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Import wizard"
                icon="cloud-upload-outline"
                onPress={() => router.push('/(setting)/import-wizard')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Cache"
                icon="server-outline"
                onPress={() => router.push('/(setting)/cache')}
              />
              <View style={styles.separator} />
              <View style={styles.switchRow}>
                <View style={styles.rowLeft}>
                  <Ionicons name="cellular-outline" size={18} color={ICON_ACCENT} />
                  <Text style={styles.rowLabel}>Data saver</Text>
                </View>
                <Switch
                  value={dataSaver}
                  onValueChange={setDataSaver}
                  trackColor={{ false: '#333', true: Colors.secondary }}
                  thumbColor={Colors.text.primary}
                />
              </View>
            </View>
          </View>

          {/* Content */}
          <View>
            <Text style={styles.sectionTitle}>Content</Text>
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="warning-outline" size={18} color={ICON_ACCENT} />
                    <Text style={styles.rowLabel}>Allow R18 content</Text>
                  </View>
                  <Text style={styles.rowDescription}>
                    Show 18+ entries in seasonal lists and search
                  </Text>
                </View>
                <Switch
                  value={prefs.allowAdultContent}
                  onValueChange={handleAdultToggle}
                  trackColor={{ false: '#333', true: Colors.secondary }}
                  thumbColor={Colors.text.primary}
                />
              </View>
            </View>
          </View>

          {/* Bangumi options */}
          <View>
            <Text style={styles.sectionTitle}>Bangumi options</Text>
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="game-controller-outline" size={18} color={ICON_ACCENT} />
                    <Text style={styles.rowLabel}>Include games</Text>
                  </View>
                  <Text style={styles.rowDescription}>Show video games in Bangumi calendar</Text>
                </View>
                <Switch
                  value={prefs.bangumiIncludeGames}
                  onValueChange={(v) => void updatePref('bangumiIncludeGames', v)}
                  trackColor={{ false: '#333', true: Colors.secondary }}
                  thumbColor={Colors.text.primary}
                />
              </View>
              <View style={styles.separator} />
              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="star-outline" size={18} color={ICON_ACCENT} />
                    <Text style={styles.rowLabel}>Show score prominently</Text>
                  </View>
                  <Text style={styles.rowDescription}>Display rating in card header</Text>
                </View>
                <Switch
                  value={prefs.bangumiShowScoreProminently}
                  onValueChange={(v) => void updatePref('bangumiShowScoreProminently', v)}
                  trackColor={{ false: '#333', true: Colors.secondary }}
                  thumbColor={Colors.text.primary}
                />
              </View>
            </View>
          </View>

          {/* Notifications */}
          <View>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <View style={styles.card}>
              <SettingItem
                label="Reminders"
                icon="notifications-outline"
                onPress={() => router.push('/(setting)/notifications')}
              />
            </View>
          </View>

          {/* About */}
          <View>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.card}>
              <SettingItem
                label="Attribution"
                icon="ribbon-outline"
                onPress={() => router.push('/(setting)/attribution')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Privacy policy"
                icon="lock-closed-outline"
                onPress={() => router.push('/(setting)/privacy')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Terms of service"
                icon="document-text-outline"
                onPress={() => router.push('/(setting)/terms')}
              />
            </View>
          </View>

          <Text style={styles.versionText}>Aniseekr v1.0.0 (Expo)</Text>
        </ScrollView>
      </SafeAreaView>
      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
}

const ICON_ACCENT = Colors.primary;
const CARD_BG = '#252528';
const CARD_BORDER = '#38383A';
const ROW_LABEL_COLOR = '#FFFFFF';
const ROW_META_COLOR = '#787878';

function SettingItem({
  label,
  icon,
  value,
  color,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value?: string;
  color?: string;
  onPress: () => void;
}) {
  const iconColor = color ?? ICON_ACCENT;
  const labelColor = color ?? ROW_LABEL_COLOR;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.itemRow, pressed && { backgroundColor: Colors.glass.light }]}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={18} color={iconColor} />
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value && <Text style={styles.valueText}>{value}</Text>}
        <Ionicons name="chevron-forward" size={16} color={ROW_META_COLOR} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.glass.light,
    borderRadius: Radius.full,
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    fontFamily: Typography.headlineMedium?.fontFamily,
  },
  headerSubtitle: {
    color: ROW_META_COLOR,
    fontSize: 14,
    fontWeight: '400',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 120,
    paddingTop: Spacing.xs,
    gap: Spacing.lg,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
    marginLeft: 4,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    backgroundColor: CARD_BORDER,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  rowLabel: {
    color: ROW_LABEL_COLOR,
    fontSize: 14,
    fontWeight: '600',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  valueText: {
    color: ROW_META_COLOR,
    fontSize: 13,
    fontWeight: '500',
  },
  versionText: {
    color: Colors.text.disabled,
    textAlign: 'center',
    ...Typography.caption,
    marginTop: Spacing.md,
  },
  rowDescription: {
    color: ROW_META_COLOR,
    fontSize: 12,
    marginTop: 2,
    marginLeft: 32,
  },
  switchTextWrap: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  premiumHeroWrap: {
    borderRadius: Radius.cardLg,
    overflow: 'hidden',
  },
  premiumHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: Radius.cardLg,
  },
  premiumHeroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  premiumIconBubble: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumHeroTitle: {
    color: '#fff',
    ...Typography.titleLarge,
    fontWeight: '700',
  },
  premiumHeroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    ...Typography.bodySmall,
  },
  premiumCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.chipLg,
  },
  premiumCtaText: {
    color: '#fff',
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  premiumActiveCard: {
    padding: Spacing.md,
  },
  premiumActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  premiumActiveLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  premiumActiveTitle: {
    color: Colors.text.primary,
    ...Typography.titleMedium,
    fontWeight: '700',
  },
  premiumActiveSubtitle: {
    color: Colors.text.secondary,
    ...Typography.bodySmall,
    marginTop: 2,
  },
  manageButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.chipLg,
    backgroundColor: Colors.glass.medium,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  manageButtonText: {
    color: Colors.text.primary,
    ...Typography.titleSmall,
  },
});
