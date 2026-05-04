import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useSubscription } from '../../context/SubscriptionContext';
import type { SubscriptionOfferingPackage } from '../../libs/services/subscription/subscription-service';

const FEATURES = [
  { icon: 'block' as const, label: 'No ads' },
  { icon: 'palette' as const, label: 'All premium themes' },
  { icon: 'cloud-sync' as const, label: 'Unlimited sync platforms' },
  { icon: 'auto-awesome' as const, label: 'Pilgrimage offline maps' },
];

export interface PaywallSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function PaywallSheet({ visible, onClose }: PaywallSheetProps) {
  const { theme } = useTheme();
  const subscription = useSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo<SubscriptionOfferingPackage[]>(() => {
    const offerings = subscription.offerings;
    if (offerings.length === 0) return [];
    const primary = offerings[0];
    const list: SubscriptionOfferingPackage[] = [];
    if (primary.annual) list.push(primary.annual);
    if (primary.monthly) list.push(primary.monthly);
    if (primary.lifetime) list.push(primary.lifetime);
    if (list.length === 0) {
      list.push(...primary.availablePackages.slice(0, 3));
    }
    return list;
  }, [subscription.offerings]);

  const handlePurchase = async (pkg: SubscriptionOfferingPackage) => {
    setBusy(true);
    setError(null);
    try {
      const result = await subscription.purchase(pkg);
      if (result.isPro) {
        hapticsBridge.success();
        onClose();
      } else {
        setError('Purchase did not complete. Please try again.');
      }
    } catch (e) {
      hapticsBridge.error();
      const message = e instanceof Error ? e.message : 'Purchase failed';
      if (!/cancel/i.test(message)) {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await subscription.restore();
      if (next.isPro) {
        hapticsBridge.success();
        onClose();
      } else {
        setError('No active subscription found on this account.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
          ]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.text.primary }]}>Aniseekr Pro</Text>
              <Text style={[styles.subtitle, { color: theme.text.secondary }]}>
                Unlock the full toolkit
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={[
                styles.closeBtn,
                {
                  backgroundColor: theme.background.tertiary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <MaterialIcons name="close" size={18} color={theme.text.primary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 480 }}>
            <View style={styles.features}>
              {FEATURES.map((feature) => (
                <View key={feature.label} style={styles.featureRow}>
                  <View style={[styles.featureIcon, { backgroundColor: theme.accent + '24' }]}>
                    <MaterialIcons name={feature.icon} size={18} color={theme.accent} />
                  </View>
                  <Text style={[styles.featureLabel, { color: theme.text.primary }]}>
                    {feature.label}
                  </Text>
                </View>
              ))}
            </View>

            {subscription.unsupported ? (
              <View style={[styles.warning, { borderColor: theme.glassBorder }]}>
                <Text style={[styles.warningText, { color: theme.text.secondary }]}>
                  In-app purchases are not configured for this build. Run with a development client
                  that bundles react-native-purchases and provide EXPO_PUBLIC_REVENUECAT_*_KEY env
                  vars to test purchases.
                </Text>
              </View>
            ) : null}

            {candidates.length === 0 && !subscription.unsupported ? (
              <View style={styles.loading}>
                <ActivityIndicator color={theme.accent} />
                <Text style={[styles.loadingLabel, { color: theme.text.secondary }]}>
                  Loading offerings…
                </Text>
              </View>
            ) : null}

            {candidates.map((pkg) => (
              <Pressable
                key={pkg.identifier}
                onPress={() => handlePurchase(pkg)}
                disabled={busy}
                style={({ pressed }) => [
                  styles.packageRow,
                  {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                    opacity: pressed || busy ? 0.85 : 1,
                  },
                ]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.packageTitle, { color: theme.text.primary }]}>
                    {labelForPackage(pkg)}
                  </Text>
                  {pkg.product?.description ? (
                    <Text style={[styles.packageDescription, { color: theme.text.secondary }]}>
                      {pkg.product.description}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.packagePrice, { color: theme.accent }]}>
                  {pkg.priceString || '—'}
                </Text>
              </Pressable>
            ))}

            {error ? <Text style={[styles.error, { color: '#FF453A' }]}>{error}</Text> : null}

            <Pressable
              onPress={handleRestore}
              disabled={busy}
              style={({ pressed }) => [styles.restore, { opacity: pressed ? 0.7 : 1 }]}>
              <Text style={[styles.restoreLabel, { color: theme.text.secondary }]}>
                Restore purchases
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function labelForPackage(pkg: SubscriptionOfferingPackage): string {
  switch (pkg.packageType) {
    case 'ANNUAL':
      return 'Annual';
    case 'MONTHLY':
      return 'Monthly';
    case 'LIFETIME':
      return 'Lifetime';
    case 'WEEKLY':
      return 'Weekly';
    default:
      return pkg.product?.title ?? pkg.identifier;
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.headlineMedium,
  },
  subtitle: {
    ...Typography.bodyMedium,
    marginTop: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  features: {
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    ...Typography.titleMedium,
  },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  packageTitle: {
    ...Typography.titleLarge,
  },
  packageDescription: {
    ...Typography.bodySmall,
    marginTop: 4,
  },
  packagePrice: {
    ...Typography.titleLarge,
    fontWeight: '700',
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  loadingLabel: {
    ...Typography.bodyMedium,
  },
  warning: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  warningText: {
    ...Typography.bodySmall,
  },
  error: {
    ...Typography.bodySmall,
    marginTop: Spacing.sm,
  },
  restore: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  restoreLabel: {
    ...Typography.titleSmall,
  },
});
