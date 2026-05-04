import { memo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassButton } from '../common/GlassButton';
import { Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

export type RatingType = 'skip' | 'dislike' | 'neutral' | 'like' | 'love' | 'tracking';
export type RatingMode = 'threeButtons' | 'fiveButtons';

interface RatingActionButtonsProps {
  mode?: RatingMode;
  onRate: (rating: RatingType) => void;
  onRefresh?: () => void;
  onAddToList?: () => void;
  showTracking?: boolean;
  style?: ViewStyle;
}

const FIVE_BUTTONS: {
  type: RatingType;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  size: number;
  haptic: 'light' | 'medium' | 'heavy';
}[] = [
  { type: 'skip', icon: 'play-skip-forward', color: '#9CA3AF', size: 22, haptic: 'light' },
  { type: 'dislike', icon: 'thumbs-down', color: '#FF6F60', size: 22, haptic: 'medium' },
  { type: 'neutral', icon: 'remove', color: '#FBBF24', size: 26, haptic: 'light' },
  { type: 'like', icon: 'heart', color: '#34D399', size: 26, haptic: 'medium' },
  { type: 'love', icon: 'flame', color: '#F97316', size: 26, haptic: 'heavy' },
];

function RatingActionButtonsComponent({
  mode = 'threeButtons',
  onRate,
  onRefresh,
  onAddToList,
  showTracking = false,
  style,
}: RatingActionButtonsProps) {
  const { theme } = useTheme();

  const handleRate = (rating: RatingType, haptic: 'light' | 'medium' | 'heavy') => {
    hapticsBridge.impact(haptic);
    onRate(rating);
  };

  if (mode === 'fiveButtons') {
    return (
      <View style={[styles.row, styles.fiveRow, style]}>
        {FIVE_BUTTONS.map((b) => (
          <GlassButton
            key={b.type}
            size={56}
            haptic="none"
            highlightColor={b.color}
            onPress={() => handleRate(b.type, b.haptic)}>
            <Ionicons name={b.icon} size={b.size} color={b.color} />
          </GlassButton>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.row, style]}>
      {onRefresh ? (
        <GlassButton size={48} haptic="selection" onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color={theme.text.primary} />
        </GlassButton>
      ) : null}

      <GlassButton
        size={56}
        haptic="none"
        highlightColor="#FF6F60"
        onPress={() => handleRate('skip', 'light')}>
        <Ionicons name="close" size={26} color="#FF6F60" />
      </GlassButton>

      <GlassButton
        size={72}
        haptic="none"
        highlightColor={theme.accent}
        onPress={() => handleRate('love', 'heavy')}>
        <Ionicons name="flame" size={32} color={theme.accent} />
      </GlassButton>

      <GlassButton
        size={56}
        haptic="none"
        highlightColor="#34D399"
        onPress={() => handleRate('like', 'medium')}>
        <Ionicons name="heart" size={24} color="#34D399" />
      </GlassButton>

      {showTracking && onAddToList ? (
        <GlassButton size={48} haptic="selection" onPress={onAddToList}>
          <Ionicons name="bookmark" size={20} color={theme.text.primary} />
        </GlassButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  fiveRow: {
    gap: Spacing.sm,
  },
});

export const RatingActionButtons = memo(RatingActionButtonsComponent);
