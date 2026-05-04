import { memo } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Typography } from '../../constants/DesignSystem';

export type AnimeStatus =
  | 'watching'
  | 'completed'
  | 'on_hold'
  | 'dropped'
  | 'planning'
  | 'rewatching'
  | 'unknown';

interface AnimeStatusBadgeProps {
  status: AnimeStatus | string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

const STATUS_CONFIG: Record<AnimeStatus, { label: string; color: string; bg: string }> = {
  watching: { label: 'Watching', color: '#fff', bg: '#0A84FF' },
  completed: { label: 'Completed', color: '#fff', bg: '#30D158' },
  on_hold: { label: 'On Hold', color: '#fff', bg: '#FF9F0A' },
  dropped: { label: 'Dropped', color: '#fff', bg: '#FF453A' },
  planning: { label: 'Plan to Watch', color: '#fff', bg: '#5E5CE6' },
  rewatching: { label: 'Rewatching', color: '#fff', bg: '#BF5AF2' },
  unknown: { label: 'Unknown', color: 'rgba(255,255,255,0.7)', bg: 'rgba(255,255,255,0.12)' },
};

function normalize(status: string): AnimeStatus {
  const v = status.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (v in STATUS_CONFIG) return v as AnimeStatus;
  if (v === 'on_air' || v === 'airing' || v === 'currently_airing') return 'watching';
  if (v === 'finished_airing' || v === 'finished') return 'completed';
  if (v === 'paused') return 'on_hold';
  if (v === 'plan_to_watch' || v === 'plan') return 'planning';
  return 'unknown';
}

function AnimeStatusBadgeComponent({ status, size = 'md', style }: AnimeStatusBadgeProps) {
  const config = STATUS_CONFIG[normalize(status)];
  const isSm = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.bg,
          paddingHorizontal: isSm ? 8 : 10,
          paddingVertical: isSm ? 2 : 4,
          borderRadius: isSm ? 8 : 10,
        },
        style,
      ]}>
      <Text style={[isSm ? styles.labelSm : styles.label, { color: config.color }]}>
        {config.label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
  },
  label: {
    ...Typography.captionSmall,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  labelSm: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});

export const AnimeStatusBadge = memo(AnimeStatusBadgeComponent);
