import { memo } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm) / 2;

export type MoodKey =
  | 'cozy'
  | 'thrilling'
  | 'romantic'
  | 'epic'
  | 'comedic'
  | 'mysterious'
  | 'melancholic'
  | 'inspiring';

interface MoodOption {
  key: MoodKey;
  label: string;
  emoji: string;
  description: string;
  gradient: [string, string];
}

export const MOOD_OPTIONS: MoodOption[] = [
  {
    key: 'cozy',
    label: 'Cozy',
    emoji: '🍵',
    description: 'Slice of life',
    gradient: ['#F59E0B', '#D97706'],
  },
  {
    key: 'thrilling',
    label: 'Thrilling',
    emoji: '⚡',
    description: 'On the edge',
    gradient: ['#EF4444', '#B91C1C'],
  },
  {
    key: 'romantic',
    label: 'Romantic',
    emoji: '💕',
    description: 'Heart-fluttering',
    gradient: ['#EC4899', '#BE185D'],
  },
  {
    key: 'epic',
    label: 'Epic',
    emoji: '🐉',
    description: 'Grand adventure',
    gradient: ['#8B5CF6', '#6D28D9'],
  },
  {
    key: 'comedic',
    label: 'Comedic',
    emoji: '😂',
    description: 'Laugh out loud',
    gradient: ['#FBBF24', '#D97706'],
  },
  {
    key: 'mysterious',
    label: 'Mysterious',
    emoji: '🔮',
    description: 'Twists & turns',
    gradient: ['#6366F1', '#3730A3'],
  },
  {
    key: 'melancholic',
    label: 'Melancholic',
    emoji: '🌧️',
    description: 'Quietly moving',
    gradient: ['#0EA5E9', '#0369A1'],
  },
  {
    key: 'inspiring',
    label: 'Inspiring',
    emoji: '🌅',
    description: 'Uplifting stories',
    gradient: ['#10B981', '#047857'],
  },
];

interface MoodSelectorProps {
  value?: MoodKey;
  onSelect: (key: MoodKey) => void;
}

function MoodSelectorComponent({ value, onSelect }: MoodSelectorProps) {
  const { theme } = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={[styles.subtitle, { color: theme.text.secondary }]}>
        How do you want to feel?
      </Text>
      <View style={styles.grid}>
        {MOOD_OPTIONS.map((mood, idx) => (
          <MoodCard
            key={mood.key}
            mood={mood}
            isSelected={value === mood.key}
            onPress={() => {
              hapticsBridge.impact('medium');
              onSelect(mood.key);
            }}
            delay={idx * 60}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function MoodCard({
  mood,
  isSelected,
  onPress,
  delay,
}: {
  mood: MoodOption;
  isSelected: boolean;
  onPress: () => void;
  delay: number;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInUp.delay(delay).springify()}
      style={[{ width: CARD_WIDTH }, animatedStyle]}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.95, { damping: 12, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 300 });
        }}
        onPress={onPress}
        style={[styles.cardWrap, isSelected && { borderColor: '#fff', borderWidth: 2 }]}>
        <LinearGradient
          colors={mood.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}>
          <Text style={styles.emoji}>{mood.emoji}</Text>
          <Text style={styles.label}>{mood.label}</Text>
          <Text style={styles.description}>{mood.description}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.md,
  },
  subtitle: {
    ...Typography.bodyMedium,
    marginBottom: Spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  cardWrap: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  card: {
    height: 130,
    padding: Spacing.sm + 2,
    justifyContent: 'space-between',
  },
  emoji: {
    fontSize: 30,
  },
  label: {
    ...Typography.titleMedium,
    color: '#fff',
    fontWeight: '700',
  },
  description: {
    ...Typography.captionSmall,
    color: 'rgba(255,255,255,0.85)',
  },
});

export const MoodSelector = memo(MoodSelectorComponent);
