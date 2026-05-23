import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { readableTextOn } from '../../components/themed';
import { PlatformLogo } from '../../components/streaming/PlatformLogo';
import {
  SettingsScreenLayout,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  loadUserPrefsSync,
  patchStreamingPrefs,
  subscribeUserPrefs,
  type StreamingPrefs,
} from '../../libs/services/user-prefs';
import {
  listStreamingPlatforms,
  resolveLogoDomain,
  type StreamingPlatformId,
  type StreamingPlatformSpec,
} from '../../libs/services/streaming/streaming-platforms';

export default function WatchPlatformsScreen() {
  const { theme } = useTheme();
  const [prefs, setPrefs] = useState<StreamingPrefs>(
    () => loadUserPrefsSync().streamingPlatforms,
  );

  useEffect(() => {
    let mounted = true;
    // Initial state is seeded synchronously; this effect only needs to keep
    // it in sync when another mounted screen (anime detail long-press,
    // settings quick action) patches the prefs.
    const unsub = subscribeUserPrefs((p) => {
      if (mounted) setPrefs(p.streamingPlatforms);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const update = useCallback(async (patch: Partial<StreamingPrefs>) => {
    const next = await patchStreamingPrefs(patch);
    setPrefs(next);
  }, []);

  // Both callbacks read the latest persisted prefs instead of closing over
  // `prefs` from render. That keeps their identity stable (no `prefs` dep)
  // so children stay memo-friendly, and removes the "stale toggle" race
  // when two taps land before the first patch completes.
  const togglePlatform = useCallback(async (id: StreamingPlatformId) => {
    const current = loadUserPrefsSync().streamingPlatforms;
    const isOn = current.enabled.includes(id);
    const enabled = isOn ? current.enabled.filter((x) => x !== id) : [...current.enabled, id];
    const primary = enabled.includes(current.primary ?? ('' as StreamingPlatformId))
      ? current.primary
      : enabled[0] ?? null;
    hapticsBridge.selection();
    setPrefs(await patchStreamingPrefs({ enabled, primary }));
  }, []);

  const setPrimary = useCallback(async (id: StreamingPlatformId) => {
    const current = loadUserPrefsSync().streamingPlatforms;
    if (!current.enabled.includes(id)) {
      // First add the platform, then mark primary — keeps the rule that
      // primary ∈ enabled (see normalizeStreamingPrefs).
      const enabled = [...current.enabled, id];
      hapticsBridge.success();
      setPrefs(await patchStreamingPrefs({ enabled, primary: id }));
      return;
    }
    hapticsBridge.success();
    setPrefs(await patchStreamingPrefs({ primary: id }));
  }, []);

  const platforms = useMemo(() => listStreamingPlatforms(), []);
  const enabledSet = useMemo(() => new Set(prefs.enabled), [prefs.enabled]);
  const primaryName = prefs.primary
    ? platformById(platforms, prefs.primary)?.displayName ?? prefs.primary
    : null;
  const subtitle =
    prefs.enabled.length === 0
      ? 'No platforms picked yet'
      : primaryName
        ? `${prefs.enabled.length} enabled · Primary: ${primaryName}`
        : `${prefs.enabled.length} enabled`;

  return (
    <SettingsScreenLayout title="Watch platforms" subtitle={subtitle}>
      <Text style={[styles.intro, { color: theme.text.secondary }]}>
        Pick where you actually watch — those platforms show up first on every anime, and we’ll
        deep-link straight into the app when it’s installed.
      </Text>

      <SettingsSection title="Preferences">
        <ToggleRow
          icon="rocket-outline"
          label="Open in app when installed"
          description="Try the platform’s app via deep-link before falling back to the web URL."
          value={prefs.preferAppDeepLink}
          onChange={(v) => void update({ preferAppDeepLink: v })}
        />
      </SettingsSection>

      <SettingsSection title="Platforms">
        {platforms.map((spec, idx) => (
          <View key={spec.id}>
            <PlatformRow
              spec={spec}
              enabled={enabledSet.has(spec.id)}
              isPrimary={prefs.primary === spec.id}
              onToggle={() => void togglePlatform(spec.id)}
              onPrimary={() => void setPrimary(spec.id)}
            />
            {idx < platforms.length - 1 ? (
              <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
            ) : null}
          </View>
        ))}
      </SettingsSection>

      <Text style={[styles.footnote, { color: theme.text.tertiary }]}>
        Your picks live on this device only — there’s no Aniseekr server holding them.
      </Text>
    </SettingsScreenLayout>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  value,
  onChange,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={[styles.toggleIcon, { backgroundColor: theme.background.tertiary }]}>
        <Ionicons name={icon} size={18} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, { color: theme.text.primary }]}>{label}</Text>
        {description ? (
          <Text style={[styles.toggleDescription, { color: theme.text.secondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          hapticsBridge.selection();
          onChange(v);
        }}
        trackColor={{ false: theme.background.primary, true: theme.accent }}
        thumbColor={value ? '#fff' : '#ddd'}
      />
    </View>
  );
}

function PlatformRow({
  spec,
  enabled,
  isPrimary,
  onToggle,
  onPrimary,
}: {
  spec: StreamingPlatformSpec;
  enabled: boolean;
  isPrimary: boolean;
  onToggle: () => void;
  onPrimary: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${enabled ? 'Disable' : 'Enable'} ${spec.displayName}`}
      style={({ pressed }) => [
        styles.platformRow,
        pressed && { opacity: 0.7 },
      ]}>
      <PlatformLogo
        size={32}
        logoDomain={resolveLogoDomain(spec)}
        iconUrl={spec.iconUrl}
        monogram={spec.monogram}
        brandColor={spec.color}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.platformName, { color: theme.text.primary }]} numberOfLines={1}>
          {spec.displayName}
        </Text>
        <Text
          style={[styles.platformMeta, { color: theme.text.tertiary }]}
          numberOfLines={1}>
          {spec.regions?.join(' · ') ?? 'Streaming service'}
        </Text>
      </View>
      <Pressable
        onPress={onPrimary}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={isPrimary ? 'Primary platform' : 'Make primary'}
        style={styles.starButton}>
        <Ionicons
          name={isPrimary ? 'star' : 'star-outline'}
          size={20}
          color={isPrimary ? '#FFD60A' : theme.text.tertiary}
        />
      </Pressable>
      <View
        style={[
          styles.toggleDot,
          {
            backgroundColor: enabled ? theme.accent : 'transparent',
            borderColor: enabled ? theme.accent : theme.glassBorder,
          },
        ]}>
        {enabled ? (
          <Ionicons name="checkmark" size={14} color={readableTextOn(theme.accent)} />
        ) : null}
      </View>
    </Pressable>
  );
}

function platformById(
  list: StreamingPlatformSpec[],
  id: StreamingPlatformId
): StreamingPlatformSpec | undefined {
  return list.find((p) => p.id === id);
}

const styles = StyleSheet.create({
  intro: {
    ...Typography.bodySmall,
    paddingHorizontal: 4,
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
  },
  toggleIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    ...Typography.titleMedium,
  },
  toggleDescription: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
  },
  platformName: {
    ...Typography.titleMedium,
  },
  platformMeta: {
    ...Typography.captionSmall,
    marginTop: 2,
  },
  starButton: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  toggleDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footnote: {
    ...Typography.captionSmall,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
  },
});
