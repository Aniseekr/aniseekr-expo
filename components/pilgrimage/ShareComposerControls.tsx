// Composer controls extracted from the share screen so it stays under ~700
// lines. State still lives on the share screen — this component just renders
// chips/inputs and routes user intent back via callbacks. Implements Track A
// of the composer pipeline plan (2026-05-26-composer-pipeline.md): #1
// background color, #2 image-pair swap, #3 text watermark, #6 export
// resolution.

import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../themed';
import type { ThemePalette } from '../../context/ThemeContext';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  EXPORT_RESOLUTIONS,
  WATERMARK_MAX_LENGTH,
  WATERMARK_POSITIONS,
  type ExportResolution,
  type WatermarkPosition,
} from '../../libs/services/pilgrimage/share-composer';
import {
  FILTER_PRESETS,
  type FilterPresetId,
} from '../../libs/services/pilgrimage/share-filters';

// Curated palette: keeps callers from having to know hex codes. The first
// entry is "reset to template default"; the rest cover warm/cool/neutral so
// users find a fit for any template without a colour wheel.
export const BG_SWATCHES: { id: string; hex: string | null; label: string }[] = [
  { id: 'reset', hex: null, label: 'Reset' },
  { id: 'beige', hex: '#F5F1E8', label: 'Beige' },
  { id: 'white', hex: '#FFFFFF', label: 'White' },
  { id: 'black', hex: '#0E0A06', label: 'Black' },
  { id: 'cream', hex: '#FFF5E1', label: 'Cream' },
  { id: 'yellow', hex: '#FFE45C', label: 'Yellow' },
  { id: 'peach', hex: '#FFCFA8', label: 'Peach' },
  { id: 'pink', hex: '#FFB6D5', label: 'Pink' },
  { id: 'sky', hex: '#B6D9FF', label: 'Sky' },
  { id: 'mint', hex: '#B6FFD9', label: 'Mint' },
  { id: 'lavender', hex: '#D9B6FF', label: 'Lavender' },
  { id: 'navy', hex: '#1B2840', label: 'Navy' },
];

export type ShareComposerControlsProps = {
  theme: ThemePalette;
  accent: string;
  swapOrder: boolean;
  onSwapOrderChange: (next: boolean) => void;
  customBg: string | null;
  onCustomBgChange: (next: string | null) => void;
  watermarkInput: string;
  onWatermarkInputChange: (next: string) => void;
  watermarkPosition: WatermarkPosition;
  onWatermarkPositionChange: (next: WatermarkPosition) => void;
  watermarkOpacity: number;
  onWatermarkOpacityChange: (next: number) => void;
  exportResolution: ExportResolution;
  onExportResolutionChange: (next: ExportResolution) => void;
  filterPreset: FilterPresetId;
  onFilterPresetChange: (next: FilterPresetId) => void;
  filterIntensity: number;
  onFilterIntensityChange: (next: number) => void;
  onOpenCrop: () => void;
  cropApplied: boolean;
  // Track C — smart adjustments.
  autoMatchEnabled: boolean;
  autoMatchLoading: boolean;
  autoMatchAvailable: boolean;
  onAutoMatchChange: (next: boolean) => void;
  autoWarpEnabled: boolean;
  autoWarpAvailable: boolean;
  onAutoWarpChange: (next: boolean) => void;
};

const POSITION_LABELS: Record<WatermarkPosition, string> = {
  topLeft: '↖︎',
  topRight: '↗︎',
  bottomLeft: '↙︎',
  bottomRight: '↘︎',
  center: '⊙',
};

export function ShareComposerControls(props: ShareComposerControlsProps) {
  const {
    theme,
    accent,
    swapOrder,
    onSwapOrderChange,
    customBg,
    onCustomBgChange,
    watermarkInput,
    onWatermarkInputChange,
    watermarkPosition,
    onWatermarkPositionChange,
    watermarkOpacity,
    onWatermarkOpacityChange,
    exportResolution,
    onExportResolutionChange,
    filterPreset,
    onFilterPresetChange,
    filterIntensity,
    onFilterIntensityChange,
    onOpenCrop,
    cropApplied,
    autoMatchEnabled,
    autoMatchLoading,
    autoMatchAvailable,
    onAutoMatchChange,
    autoWarpEnabled,
    autoWarpAvailable,
    onAutoWarpChange,
  } = props;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accentFg = readableTextOn(accent);

  const handleSwap = useCallback(() => {
    hapticsBridge.selection();
    onSwapOrderChange(!swapOrder);
  }, [swapOrder, onSwapOrderChange]);

  const handlePickColor = useCallback(
    (hex: string | null) => {
      hapticsBridge.selection();
      onCustomBgChange(hex);
    },
    [onCustomBgChange]
  );

  return (
    <View style={styles.root}>
      {/* --- Order swap + Resolution row --- */}
      <View style={styles.row}>
        <Pressable
          onPress={handleSwap}
          accessibilityRole="button"
          accessibilityLabel="Swap image order"
          accessibilityState={{ selected: swapOrder }}
          style={({ pressed }) => [
            styles.swapChip,
            {
              backgroundColor: swapOrder ? accent : theme.background.secondary,
              borderColor: swapOrder ? accent : theme.glassBorder,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <Ionicons
            name="swap-horizontal"
            size={16}
            color={swapOrder ? accentFg : theme.text.primary}
          />
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: swapOrder ? accentFg : theme.text.primary }}>
            {swapOrder ? 'REAL first' : 'ANIME first'}
          </ThemedText>
        </Pressable>

        <View style={styles.resGroup}>
          {EXPORT_RESOLUTIONS.map((r) => {
            const active = r.id === exportResolution;
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  hapticsBridge.selection();
                  onExportResolutionChange(r.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Export ${r.label} (${r.hint})`}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.resChip,
                  {
                    backgroundColor: active ? accent : theme.background.secondary,
                    borderColor: active ? accent : theme.glassBorder,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  style={{ color: active ? accentFg : theme.text.primary }}>
                  {r.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* --- Filter presets + Crop chip --- */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="color-filter-outline" size={14} color={theme.text.secondary} />
          <ThemedText variant="captionSmall" tone="secondary" weight="600">
            Filter
          </ThemedText>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              onOpenCrop();
            }}
            accessibilityRole="button"
            accessibilityLabel="Crop user photo"
            style={({ pressed }) => [
              styles.cropChip,
              {
                backgroundColor: cropApplied ? accent : theme.background.tertiary,
                borderColor: cropApplied ? accent : theme.glassBorder,
                opacity: pressed ? 0.85 : 1,
                marginLeft: 'auto',
              },
            ]}>
            <Ionicons
              name="crop"
              size={13}
              color={cropApplied ? accentFg : theme.text.primary}
            />
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: cropApplied ? accentFg : theme.text.primary }}>
              {cropApplied ? 'Cropped' : 'Crop'}
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}>
          {FILTER_PRESETS.map((f) => {
            const active = f.id === filterPreset;
            return (
              <Pressable
                key={f.id}
                onPress={() => {
                  hapticsBridge.selection();
                  onFilterPresetChange(f.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${f.label}`}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.filterChip,
                  {
                    backgroundColor: active ? accent : theme.background.secondary,
                    borderColor: active ? accent : theme.glassBorder,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  style={{ color: active ? accentFg : theme.text.primary }}>
                  {f.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
        {filterPreset !== 'none' ? (
          <View style={styles.opacityRow}>
            <ThemedText variant="captionSmall" tone="secondary" weight="600">
              {`${Math.round(filterIntensity * 100)}%`}
            </ThemedText>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              step={0.05}
              value={filterIntensity}
              minimumTrackTintColor={accent}
              maximumTrackTintColor={theme.background.tertiary}
              thumbTintColor={accent}
              onValueChange={onFilterIntensityChange}
            />
          </View>
        ) : null}
      </View>

      {/* --- Smart adjustments (Track C) --- */}
      <View style={styles.smartGroup}>
        <SmartToggle
          theme={theme}
          accent={accent}
          icon="color-wand-outline"
          label="Auto color match"
          subtitle={
            !autoMatchAvailable
              ? 'Needs both photos loaded'
              : autoMatchLoading
                ? 'Analysing…'
                : 'Match user shot to anime palette'
          }
          value={autoMatchEnabled}
          disabled={!autoMatchAvailable || autoMatchLoading}
          loading={autoMatchLoading}
          onChange={onAutoMatchChange}
        />
        <SmartToggle
          theme={theme}
          accent={accent}
          icon="scan-outline"
          label="Auto perspective"
          subtitle={
            autoWarpAvailable
              ? 'Correct tilt from capture sensors'
              : 'No sensor data on this capture'
          }
          value={autoWarpEnabled}
          disabled={!autoWarpAvailable}
          loading={false}
          onChange={onAutoWarpChange}
        />
      </View>

      {/* --- Background color swatches --- */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette-outline" size={14} color={theme.text.secondary} />
          <ThemedText variant="captionSmall" tone="secondary" weight="600">
            Background
          </ThemedText>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.swatchRow}>
          {BG_SWATCHES.map((s) => {
            const active = s.hex === customBg || (s.hex === null && customBg === null);
            return (
              <Pressable
                key={s.id}
                onPress={() => handlePickColor(s.hex)}
                accessibilityRole="button"
                accessibilityLabel={`Background ${s.label}`}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.swatch,
                  {
                    borderColor: active ? accent : theme.glassBorder,
                    borderWidth: active ? 2 : 1,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                {s.hex === null ? (
                  <View style={[styles.swatchFill, { backgroundColor: theme.background.tertiary }]}>
                    <Ionicons name="close" size={16} color={theme.text.secondary} />
                  </View>
                ) : (
                  <View style={[styles.swatchFill, { backgroundColor: s.hex }]} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* --- Watermark --- */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="text-outline" size={14} color={theme.text.secondary} />
          <ThemedText variant="captionSmall" tone="secondary" weight="600">
            Watermark
          </ThemedText>
          <ThemedText
            variant="captionSmall"
            tone="secondary"
            style={{ marginLeft: 'auto', opacity: 0.6 }}>
            {`${watermarkInput.length}/${WATERMARK_MAX_LENGTH}`}
          </ThemedText>
        </View>
        <TextInput
          value={watermarkInput}
          onChangeText={(v) => onWatermarkInputChange(v.slice(0, WATERMARK_MAX_LENGTH))}
          placeholder="@your_handle, trip name, …"
          placeholderTextColor={theme.text.tertiary}
          maxLength={WATERMARK_MAX_LENGTH}
          style={[
            styles.input,
            {
              color: theme.text.primary,
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}
        />
        {watermarkInput.trim().length > 0 ? (
          <View style={styles.watermarkAdjustRow}>
            <View style={styles.positionGroup}>
              {WATERMARK_POSITIONS.map((p) => {
                const active = p === watermarkPosition;
                return (
                  <Pressable
                    key={p}
                    onPress={() => {
                      hapticsBridge.selection();
                      onWatermarkPositionChange(p);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Watermark position ${p}`}
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.positionChip,
                      {
                        backgroundColor: active ? accent : theme.background.secondary,
                        borderColor: active ? accent : theme.glassBorder,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <ThemedText
                      variant="captionSmall"
                      weight="700"
                      style={{ color: active ? accentFg : theme.text.primary }}>
                      {POSITION_LABELS[p]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.opacityRow}>
              <ThemedText variant="captionSmall" tone="secondary" weight="600">
                {`${Math.round(watermarkOpacity * 100)}%`}
              </ThemedText>
              <Slider
                style={styles.slider}
                minimumValue={0.2}
                maximumValue={1}
                step={0.05}
                value={watermarkOpacity}
                minimumTrackTintColor={accent}
                maximumTrackTintColor={theme.background.tertiary}
                thumbTintColor={accent}
                onValueChange={onWatermarkOpacityChange}
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SmartToggle({
  theme,
  accent,
  icon,
  label,
  subtitle,
  value,
  disabled,
  loading,
  onChange,
}: {
  theme: ThemePalette;
  accent: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  subtitle: string;
  value: boolean;
  disabled: boolean;
  loading: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={[smartStyles.row, { borderBottomColor: theme.glassBorder }]}>
      <View
        style={[
          smartStyles.icon,
          {
            backgroundColor: `${accent}26`,
            borderColor: `${accent}55`,
            opacity: disabled ? 0.5 : 1,
          },
        ]}>
        {loading ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <Ionicons name={icon} size={16} color={accent} />
        )}
      </View>
      <View style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}>
        <ThemedText variant="bodyMedium" weight="600">
          {label}
        </ThemedText>
        <ThemedText variant="captionSmall" tone="secondary">
          {subtitle}
        </ThemedText>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={(v) => {
          hapticsBridge.selection();
          onChange(v);
        }}
        trackColor={{ false: theme.background.tertiary, true: accent }}
        thumbColor={theme.text.primary}
      />
    </View>
  );
}

const smartStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: {
      borderRadius: Radius.card,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
      padding: Spacing.sm,
      gap: Spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    swapChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
    },
    resGroup: {
      flexDirection: 'row',
      gap: 6,
      marginLeft: 'auto',
    },
    resChip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
    },
    section: {
      gap: 8,
    },
    filterRow: {
      gap: 6,
      paddingRight: 4,
    },
    filterChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    cropChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
    },
    smartGroup: {
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.tertiary,
      paddingHorizontal: 8,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    swatchRow: {
      gap: 8,
      paddingRight: 8,
    },
    swatch: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden',
    },
    swatchFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      borderRadius: Radius.sm,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 40,
    },
    watermarkAdjustRow: {
      gap: 8,
    },
    positionGroup: {
      flexDirection: 'row',
      gap: 6,
    },
    positionChip: {
      width: 38,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.sm,
      borderWidth: 1,
    },
    opacityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    slider: {
      flex: 1,
      height: 28,
    },
  });
}
