import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, useCallback } from 'react';
import {
  PLATFORM_CONFIGS,
  type PlatformAuthConfig,
  type PlatformType,
} from '../../libs/services/auth/types';
import {
  dataSourceConfig,
  BROWSE_SUPPORTED_PLATFORMS,
} from '../../libs/services/data-source-config';
import {
  dataSourceSwitchingCoordinator,
  type SwitchingState,
} from '../../libs/services/data-source-switching-coordinator';
import { GlassCard } from '../../components/common/GlassCard';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';

export default function DataSourceScreen() {
  const { top } = useSafeAreaInsets();
  const [browseSource, setBrowseSourceState] = useState<PlatformType>(
    dataSourceConfig.browseSource
  );
  const [switchingState, setSwitchingState] = useState<SwitchingState>(
    dataSourceSwitchingCoordinator.getState()
  );
  const [initLoading, setInitLoading] = useState(!dataSourceConfig.isInitialized);

  // Hydrate config on mount if not already initialized.
  useEffect(() => {
    let cancelled = false;
    if (!dataSourceConfig.isInitialized) {
      setInitLoading(true);
      dataSourceConfig
        .init()
        .then(() => {
          if (cancelled) return;
          setBrowseSourceState(dataSourceConfig.browseSource);
        })
        .finally(() => {
          if (cancelled) return;
          setInitLoading(false);
        });
    } else {
      setBrowseSourceState(dataSourceConfig.browseSource);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to coordinator transitions so the row spinner reflects state.
  useEffect(() => {
    const unsubscribe = dataSourceSwitchingCoordinator.subscribe((state) => {
      setSwitchingState(state);
      if (state.kind === 'completed') {
        setBrowseSourceState(state.source);
      }
    });
    return unsubscribe;
  }, []);

  const handleSelect = useCallback(
    async (platform: PlatformType) => {
      if (platform === browseSource) return;
      if (switchingState.kind === 'switching') return;

      const previous = browseSource;
      try {
        await dataSourceConfig.setBrowseSource(platform);
        setBrowseSourceState(platform);
        // Fire-and-forget; coordinator updates state via subscription.
        void dataSourceSwitchingCoordinator.beginSwitch(previous, platform);
      } catch (err) {
        console.warn('[DataSourceScreen] setBrowseSource failed', err);
      }
    },
    [browseSource, switchingState.kind]
  );

  const platforms: PlatformAuthConfig[] = BROWSE_SUPPORTED_PLATFORMS.map(
    (p) => PLATFORM_CONFIGS[p]
  );

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
          <Text style={styles.headerTitle}>Browse Source</Text>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.description}>
            Select the platform used to power discovery and seasonal browsing. This does not change
            which platforms sync your library.
          </Text>

          {initLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.text.primary} />
            </View>
          ) : (
            <GlassCard variant="frosted" style={styles.card}>
              {platforms.map((platform, index) => {
                const isSelected = platform.platform === browseSource;
                const isSwitchingTo =
                  switchingState.kind === 'switching' && switchingState.to === platform.platform;
                return (
                  <View key={platform.platform}>
                    <Pressable
                      onPress={() => handleSelect(platform.platform)}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && { backgroundColor: Colors.glass.light },
                      ]}
                      disabled={switchingState.kind === 'switching' || isSelected}>
                      <View style={styles.rowLeft}>
                        <View style={[styles.iconCircle, { backgroundColor: platform.color }]}>
                          <Text style={styles.iconLetter}>
                            {platform.displayName.substring(0, 1)}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.rowLabel}>{platform.displayName}</Text>
                          <Text style={styles.rowSubLabel}>
                            {isSelected ? 'Active source' : 'Tap to use'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.rowRight}>
                        {isSwitchingTo ? (
                          <ActivityIndicator color={Colors.text.primary} size="small" />
                        ) : isSelected ? (
                          <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                        ) : (
                          <Ionicons
                            name="radio-button-off"
                            size={22}
                            color={Colors.text.disabled}
                          />
                        )}
                      </View>
                    </Pressable>
                    {index < platforms.length - 1 && <View style={styles.separator} />}
                  </View>
                );
              })}
            </GlassCard>
          )}

          {switchingState.kind === 'failed' ? (
            <Text style={styles.errorText}>Switch failed: {switchingState.error.message}</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
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
    gap: Spacing.lg,
  },
  description: {
    color: Colors.text.secondary,
    ...Typography.bodyMedium,
  },
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  row: {
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
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLetter: {
    color: Colors.text.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  rowLabel: {
    color: Colors.text.primary,
    ...Typography.bodyLarge,
    fontWeight: '600',
  },
  rowSubLabel: {
    color: Colors.text.tertiary,
    ...Typography.caption,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.glass.border,
    marginLeft: 64,
  },
  loadingRow: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.error,
    ...Typography.bodyMedium,
  },
});
