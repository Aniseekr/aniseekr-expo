import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
  color: string;
}

export function StatCard({ label, value, icon, color }: StatCardProps) {
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withTiming(value, {
      duration: 1000,
    });
  }, [value]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: animatedValue.value,
  }));

  return (
    <Animated.View style={[styles.card, animatedStyle, { borderLeftColor: color }]}>
      <View style={styles.iconContainer}>
        <Text style={[styles.icon, { color }]}>●</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </Animated.View>
  );
}

interface StatsGridProps {
  stats: {
    total: number;
    watching: number;
    completed: number;
    dropped: number;
  } | null;
}

export function StatsGrid({ stats }: StatsGridProps) {
  if (!stats) return null;

  return (
    <View style={styles.container}>
      <StatCard label="Total" value={stats.total} icon="bookmark" color="#3b82f6" />
      <StatCard label="Watching" value={stats.watching} icon="play-circle" color="#10b981" />
      <StatCard label="Completed" value={stats.completed} icon="check-circle" color="#22c55e" />
      <StatCard label="Dropped" value={stats.dropped} icon="x-circle" color="#ef4444" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },

  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    width: 140,
    alignItems: 'center',
  },

  iconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  icon: {
    fontSize: 20,
    lineHeight: 24,
  },

  content: {
    flex: 1,
    alignItems: 'flex-start',
  },

  value: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 38,
  },

  label: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
  },
});
