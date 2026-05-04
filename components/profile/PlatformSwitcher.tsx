import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Spacing, Typography, FontFamily, Shadow } from '../../constants/DesignSystem';

export interface PlatformInfo {
  id: string;
  name: string;
  color: string;
  iconUrl?: string;
  initial: string;
  isConnected?: boolean;
  username?: string;
  avatarUrl?: string;
}

const DEFAULT_PLATFORMS: PlatformInfo[] = [
  { id: 'mal', name: 'MAL', color: '#2E51A2', initial: 'M' },
  { id: 'anilist', name: 'AniList', color: '#02A9FF', initial: 'A' },
  { id: 'bangumi', name: 'Bangumi', color: '#F09199', initial: 'B' },
  { id: 'kitsu', name: 'Kitsu', color: '#F75239', initial: 'K' },
  { id: 'shikimori', name: 'Shikimori', color: '#3D6B9C', initial: 'S' },
  { id: 'simkl', name: 'Simkl', color: '#0F172A', initial: 'S' },
];

interface PlatformSwitcherProps {
  platforms?: PlatformInfo[];
  selected?: string;
  onSelect?: (id: string) => void;
}

export function PlatformSwitcher({
  platforms = DEFAULT_PLATFORMS,
  selected,
  onSelect,
}: PlatformSwitcherProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Platforms</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {platforms.map((platform) => {
          const isActive = selected === platform.id;
          return (
            <Pressable
              key={platform.id}
              onPress={() => onSelect?.(platform.id)}
              style={({ pressed }) => [
                styles.circle,
                { backgroundColor: platform.color },
                isActive && styles.circleActive,
                pressed && { opacity: 0.85 },
              ]}>
              {platform.iconUrl ? (
                <Image source={{ uri: platform.iconUrl }} style={styles.icon} contentFit="cover" />
              ) : (
                <Text style={styles.initial}>{platform.initial}</Text>
              )}
              {platform.isConnected ? <View style={styles.connectedDot} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.xxl,
  },
  label: {
    ...Typography.titleSmall,
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: Spacing.sm,
    fontFamily: FontFamily.rounded,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.glass.borderHeavy,
    ...Shadow.subtle,
  },
  circleActive: {
    borderColor: Colors.text.primary,
    borderWidth: 2,
  },
  icon: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  initial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: FontFamily.rounded,
  },
  connectedDot: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.background.primary,
  },
});
