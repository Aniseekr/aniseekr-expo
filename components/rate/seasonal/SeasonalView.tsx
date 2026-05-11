// Dispatches between the four "seasonal" layouts pulled from japanwalker.pen.
// The cycle button at the top-right of the section flips through them in
// order and is wired by the parent to `patchUserPrefs({ seasonalLayout })`.

import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SeasonalCarousel } from '../SeasonalCarousel';
import { HeroRailLayout } from './HeroRailLayout';
import { ShowcaseLayout } from './ShowcaseLayout';
import { SpotlightLayout } from './SpotlightLayout';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { ThemedText } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  SEASONAL_LAYOUTS,
  type SeasonalLayout,
} from '../../../libs/services/user-prefs';
import type { Anime } from '../types';

interface SeasonalViewProps {
  data: Anime[];
  layout: SeasonalLayout;
  onSelect?: (anime: Anime) => void;
  onLayoutChange: (next: SeasonalLayout) => void;
}

const LAYOUT_META: Record<
  SeasonalLayout,
  { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }
> = {
  carousel: { label: 'Carousel', icon: 'albums-outline' },
  'hero-rail': { label: 'Hero + Rails', icon: 'reorder-three-outline' },
  showcase: { label: 'Showcase', icon: 'grid-outline' },
  spotlight: { label: 'Spotlight', icon: 'sparkles-outline' },
};

function nextLayout(current: SeasonalLayout): SeasonalLayout {
  const i = SEASONAL_LAYOUTS.indexOf(current);
  if (i < 0) return SEASONAL_LAYOUTS[0];
  return SEASONAL_LAYOUTS[(i + 1) % SEASONAL_LAYOUTS.length];
}

function SeasonalViewComponent({
  data,
  layout,
  onSelect,
  onLayoutChange,
}: SeasonalViewProps) {
  const { theme } = useTheme();
  const meta = LAYOUT_META[layout];

  const handleCycle = () => {
    hapticsBridge.selection();
    onLayoutChange(nextLayout(layout));
  };

  let body: React.ReactNode;
  switch (layout) {
    case 'hero-rail':
      body = <HeroRailLayout data={data} onSelect={onSelect} />;
      break;
    case 'showcase':
      body = <ShowcaseLayout data={data} onSelect={onSelect} />;
      break;
    case 'spotlight':
      body = <SpotlightLayout data={data} onSelect={onSelect} />;
      break;
    case 'carousel':
    default:
      body = <SeasonalCarousel data={data} onSelect={onSelect} />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.switchRow}>
        <Pressable
          onPress={handleCycle}
          accessibilityRole="button"
          accessibilityLabel={`Layout: ${meta.label}. Tap to switch.`}
          style={({ pressed }) => [
            styles.switcher,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <Ionicons name={meta.icon} size={14} color={theme.accent} />
          <ThemedText variant="captionSmall" weight="700">
            {meta.label}
          </ThemedText>
          <Ionicons name="sync-outline" size={12} color={theme.text.secondary} />
        </Pressable>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.sm,
  },
  switchRow: {
    paddingHorizontal: Spacing.lg + 4,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  switcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
});

export const SeasonalView = memo(SeasonalViewComponent);
