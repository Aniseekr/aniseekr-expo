import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme, ThemeId, ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  SettingsScreenLayout,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import {
  DEFAULT_USER_PREFS,
  loadUserPrefs,
  patchUserPrefs,
  type UserPrefs,
} from '../../libs/services/user-prefs';

export default function ThemeSettingsScreen() {
  const { theme, themeId, setTheme, themes } = useTheme();
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_USER_PREFS);
  const [sliderValue, setSliderValue] = useState<number>(DEFAULT_USER_PREFS.cardHeightPercent);

  useEffect(() => {
    let mounted = true;
    loadUserPrefs().then((p) => {
      if (mounted) {
        setPrefs(p);
        setSliderValue(p.cardHeightPercent);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSelect = async (id: ThemeId) => {
    if (id === themeId) return;
    hapticsBridge.success();
    await setTheme(id);
  };

  const handleCardHeightCommit = async (value: number) => {
    const rounded = Math.round(value / 5) * 5;
    if (rounded === prefs.cardHeightPercent) return;
    hapticsBridge.selection();
    const next = await patchUserPrefs({ cardHeightPercent: rounded });
    setPrefs(next);
    setSliderValue(next.cardHeightPercent);
  };

  return (
    <SettingsScreenLayout title="Appearance" subtitle="Pick a palette that fits your vibe">
      <Text style={[styles.intro, { color: theme.text.secondary }]}>
        Themes change accent colors, gradients, and surface tints across the entire app.
      </Text>

      <View style={styles.grid}>
        {themes.map((palette) => (
          <ThemeCard
            key={palette.id}
            palette={palette}
            isSelected={palette.id === themeId}
            onPress={() => handleSelect(palette.id)}
          />
        ))}
      </View>

      <SettingsSection title="Card height">
        <View style={styles.sliderRow}>
          <Slider
            style={styles.slider}
            value={sliderValue}
            onValueChange={setSliderValue}
            onSlidingComplete={handleCardHeightCommit}
            minimumValue={70}
            maximumValue={100}
            step={5}
            minimumTrackTintColor={Colors.primary}
            maximumTrackTintColor={Colors.glass.border}
            thumbTintColor={Colors.primary}
          />
          <Text style={[styles.sliderValue, { color: theme.text.primary }]}>
            {Math.round(sliderValue)}%
          </Text>
        </View>
        <Text style={[styles.chipHint, { color: theme.text.secondary }]}>
          Adjusts the height of Bangumi calendar and Rate cards.
        </Text>
      </SettingsSection>
    </SettingsScreenLayout>
  );
}

function ThemeCard({
  palette,
  isSelected,
  onPress,
}: {
  palette: ThemePalette;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { theme: current } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: isSelected ? palette.accent : current.glassBorder,
          borderWidth: isSelected ? 2 : 1,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <LinearGradient
        colors={palette.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardSurface}>
        <View style={styles.cardHeader}>
          <View style={[styles.swatch, { backgroundColor: palette.accent }]} />
          <View style={[styles.swatch, { backgroundColor: palette.accentLight }]} />
          <View style={[styles.swatch, { backgroundColor: palette.secondary }]} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.cardFooter}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardName, { color: palette.text.primary }]}>{palette.name}</Text>
            {palette.isPremium ? (
              <View style={[styles.badge, { backgroundColor: palette.accent + '40' }]}>
                <Text style={[styles.badgeText, { color: palette.accent }]}>Premium</Text>
              </View>
            ) : null}
          </View>
          {isSelected ? (
            <MaterialIcons name="check-circle" size={22} color={palette.accent} />
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...Typography.bodyMedium,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  card: {
    width: '48%',
    height: 170,
    borderRadius: 18,
    overflow: 'hidden',
  },
  cardSurface: {
    flex: 1,
    padding: Spacing.sm + 2,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 6,
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cardName: {
    ...Typography.titleMedium,
    fontWeight: '700',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  badgeText: {
    ...Typography.captionSmall,
    fontWeight: '700',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderValue: {
    ...Typography.titleSmall,
    minWidth: 48,
    textAlign: 'right',
    fontWeight: '700',
  },
  chipHint: {
    ...Typography.bodySmall,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
});
