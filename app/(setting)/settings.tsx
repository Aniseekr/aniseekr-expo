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
import { GlassCard } from '../../components/common/GlassCard';
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
            <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Premium hero */}
          {subscription.isPro ? (
            <GlassCard variant="frosted" style={styles.premiumActiveCard}>
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
            </GlassCard>
          ) : (
            <Pressable
              onPress={() => setPaywallVisible(true)}
              style={({ pressed }) => [styles.premiumHeroWrap, pressed && { opacity: 0.92 }]}>
              <LinearGradient
                colors={Colors.gradients.aurora}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
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
            <GlassCard variant="frosted" style={styles.card}>
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
            </GlassCard>
          </View>

          {/* Appearance */}
          <View>
            <Text style={styles.sectionTitle}>Appearance</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <SettingItem
                label="Theme"
                icon="color-palette-outline"
                onPress={() => router.push('/(setting)/theme')}
              />
              <View style={styles.separator} />
              <SettingItem
                label="Title language priority"
                icon="language-outline"
                onPress={() => router.push('/(setting)/language-priority')}
              />
            </GlassCard>
          </View>

          {/* Sync & Data */}
          <View>
            <Text style={styles.sectionTitle}>Sync & Data</Text>
            <GlassCard variant="frosted" style={styles.card}>
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
                  <Ionicons name="cellular-outline" size={22} color={Colors.text.primary} />
                  <Text style={styles.rowLabel}>Data saver</Text>
                </View>
                <Switch
                  value={dataSaver}
                  onValueChange={setDataSaver}
                  trackColor={{ false: '#333', true: Colors.secondary }}
                  thumbColor={Colors.text.primary}
                />
              </View>
            </GlassCard>
          </View>

          {/* Content */}
          <View>
            <Text style={styles.sectionTitle}>Content</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="warning-outline" size={22} color={Colors.text.primary} />
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
            </GlassCard>
          </View>

          {/* Bangumi options */}
          <View>
            <Text style={styles.sectionTitle}>Bangumi options</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <View style={styles.rowLeft}>
                    <Ionicons
                      name="game-controller-outline"
                      size={22}
                      color={Colors.text.primary}
                    />
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
                    <Ionicons name="star-outline" size={22} color={Colors.text.primary} />
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
            </GlassCard>
          </View>

          {/* Notifications */}
          <View>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <GlassCard variant="frosted" style={styles.card}>
              <SettingItem
                label="Reminders"
                icon="notifications-outline"
                onPress={() => router.push('/(setting)/notifications')}
              />
            </GlassCard>
          </View>

          {/* About */}
          <View>
            <Text style={styles.sectionTitle}>About</Text>
            <GlassCard variant="frosted" style={styles.card}>
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
            </GlassCard>
          </View>

          <Text style={styles.versionText}>Aniseekr v1.0.0 (Expo)</Text>
        </ScrollView>
      </SafeAreaView>
      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
}

function SettingItem({
  label,
  icon,
  value,
  color = Colors.text.primary,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value?: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.itemRow, pressed && { backgroundColor: Colors.glass.light }]}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={22} color={color} />
        <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value && <Text style={styles.valueText}>{value}</Text>}
        <Ionicons name="chevron-forward" size={18} color={Colors.text.disabled} />
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
    backgroundColor: Colors.glass.light,
    borderRadius: Radius.full,
  },
  headerTitle: {
    color: Colors.text.primary,
    ...Typography.headlineSmall,
  },
  scrollView: {
    flex: 1,
    marginTop: Spacing.md,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 100,
    gap: Spacing.xl,
  },
  sectionTitle: {
    color: Colors.text.secondary,
    ...Typography.caption,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xxs,
  },
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    backgroundColor: Colors.glass.border,
    marginLeft: 54, // Icon width + spacing
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowLabel: {
    color: Colors.text.primary,
    ...Typography.bodyLarge,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  valueText: {
    color: Colors.text.tertiary,
    ...Typography.bodyMedium,
  },
  versionText: {
    color: Colors.text.disabled,
    textAlign: 'center',
    ...Typography.caption,
    marginTop: Spacing.md,
  },
  rowDescription: {
    color: Colors.text.tertiary,
    ...Typography.bodySmall,
    marginTop: 2,
    marginLeft: 30,
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
