// Compact chip that surfaces the current `dataSourceConfig.browseSource` and
// jumps the user to the source picker when tapped. Subscribes to the
// switching coordinator so the label updates after a successful switch.

import { useEffect, useState } from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { PLATFORM_CONFIGS, type PlatformType } from '../../libs/services/auth/types';
import { dataSourceConfig } from '../../libs/services/data-source-config';
import {
  dataSourceSwitchingCoordinator,
  type SwitchingState,
} from '../../libs/services/data-source-switching-coordinator';

export interface BrowseSourceChipProps {
  /** Override navigation target (defaults to /(setting)/data-source). */
  onPress?: () => void;
}

export function BrowseSourceChip({ onPress }: BrowseSourceChipProps) {
  const [source, setSource] = useState<PlatformType>(dataSourceConfig.browseSource);
  const [switching, setSwitching] = useState<SwitchingState>(
    dataSourceSwitchingCoordinator.getState()
  );

  useEffect(() => {
    let cancelled = false;
    if (!dataSourceConfig.isInitialized) {
      dataSourceConfig
        .init()
        .then(() => {
          if (cancelled) return;
          setSource(dataSourceConfig.browseSource);
        })
        .catch(() => undefined);
    } else {
      setSource(dataSourceConfig.browseSource);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return dataSourceSwitchingCoordinator.subscribe((state) => {
      setSwitching(state);
      if (state.kind === 'completed') setSource(state.source);
    });
  }, []);

  const config = PLATFORM_CONFIGS[source];
  const isSwitching = switching.kind === 'switching';

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.push('/(setting)/data-source');
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: `${config.color}66` },
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Browse source: ${config.displayName}`}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={styles.label} numberOfLines={1}>
        {config.displayName}
      </Text>
      {isSwitching ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Ionicons name="swap-horizontal" size={14} color="rgba(255,255,255,0.6)" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
