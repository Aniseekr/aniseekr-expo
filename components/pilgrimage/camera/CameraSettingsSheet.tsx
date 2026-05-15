import { ReactNode, useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { readableTextOn, ThemedSurface, ThemedText } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import {
  CAPTURE_MODES,
  COUNTDOWN_SECONDS,
  PICTURE_QUALITIES,
  type CameraSettings,
  type CaptureMode,
  type CountdownSeconds,
  type PictureQuality,
} from '../../../hooks/useCameraSettings';

export interface CameraSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  settings: CameraSettings;
  onSettingsChange: (patch: Partial<CameraSettings>) => void;
  availablePictureSizes: string[];
}

const CAPTURE_MODE_LABEL: Record<CaptureMode, string> = {
  single: 'Single',
  burst: 'Burst',
  hdr: 'HDR',
};

const COUNTDOWN_LABEL: Record<CountdownSeconds, string> = {
  0: 'Off',
  3: '3s',
  5: '5s',
  10: '10s',
};

const QUALITY_LABEL: Record<PictureQuality, string> = {
  standard: 'Standard',
  high: 'High',
  max: 'Max',
};

// Auto is a synthetic value at the top of the picture-size list — when picked
// we store `null` so the camera falls back to expo-camera's default size.
const AUTO_SIZE_VALUE = '__auto__';

export default function CameraSettingsSheet({
  visible,
  onClose,
  settings,
  onSettingsChange,
  availablePictureSizes,
}: CameraSettingsSheetProps) {
  const { theme } = useTheme();

  const pictureSizeOptions = useMemo(
    () => [AUTO_SIZE_VALUE, ...availablePictureSizes],
    [availablePictureSizes]
  );
  const selectedPictureSize = settings.pictureSize ?? AUTO_SIZE_VALUE;
  const pictureSizesDisabled = availablePictureSizes.length === 0;

  const handleSelect = <K extends keyof CameraSettings>(key: K, value: CameraSettings[K]) => {
    if (settings[key] === value) return;
    hapticsBridge.selection();
    onSettingsChange({ [key]: value } as Partial<CameraSettings>);
  };

  const handleSwitch = <K extends keyof CameraSettings>(key: K, value: boolean) => {
    hapticsBridge.selection();
    onSettingsChange({ [key]: value } as Partial<CameraSettings>);
  };

  const handlePickPictureSize = (option: string) => {
    if (pictureSizesDisabled) return;
    const nextValue: string | null = option === AUTO_SIZE_VALUE ? null : option;
    if (settings.pictureSize === nextValue) return;
    hapticsBridge.selection();
    onSettingsChange({ pictureSize: nextValue });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          // Tappable scrim closes the sheet when the user taps outside it.
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss camera settings"
        />
        <ThemedSurface variant="elevated" radius={0} style={styles.sheet}>
          <View style={styles.header}>
            <ThemedText variant="titleLarge" weight="700">
              Camera settings
            </ThemedText>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close camera settings"
              style={({ pressed }) => [
                styles.closeBtn,
                { borderColor: theme.glassBorder, backgroundColor: theme.background.tertiary },
                pressed && { opacity: 0.7 },
              ]}>
              <Ionicons name="close" size={18} color={theme.text.primary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            <SettingsSection title="Capture mode">
              <SegmentedRow
                options={CAPTURE_MODES.map((m) => ({ value: m, label: CAPTURE_MODE_LABEL[m] }))}
                value={settings.captureMode}
                onSelect={(v) => handleSelect('captureMode', v)}
              />
            </SettingsSection>

            <SettingsSection title="Self-timer">
              <SegmentedRow
                options={COUNTDOWN_SECONDS.map((s) => ({ value: s, label: COUNTDOWN_LABEL[s] }))}
                value={settings.countdownSeconds}
                onSelect={(v) => handleSelect('countdownSeconds', v)}
              />
            </SettingsSection>

            <SettingsSection title="Quality">
              <SegmentedRow
                options={PICTURE_QUALITIES.map((q) => ({ value: q, label: QUALITY_LABEL[q] }))}
                value={settings.quality}
                onSelect={(v) => handleSelect('quality', v)}
              />
            </SettingsSection>

            <SettingsSection title="Picture size">
              <View style={styles.sizeGrid}>
                {pictureSizeOptions.map((option) => {
                  const label = option === AUTO_SIZE_VALUE ? 'Auto' : option;
                  const active = option === selectedPictureSize;
                  return (
                    <Segment
                      key={option}
                      label={label}
                      active={active}
                      disabled={pictureSizesDisabled && option !== AUTO_SIZE_VALUE}
                      onPress={() => handlePickPictureSize(option)}
                      accent={theme.accent}
                      borderColor={theme.glassBorder}
                      surfaceColor={theme.background.tertiary}
                      textColor={theme.text.primary}
                    />
                  );
                })}
              </View>
            </SettingsSection>

            <SwitchRow
              label="Silent shutter"
              description="Mute the shutter sound"
              value={settings.mute}
              onValueChange={(v) => handleSwitch('mute', v)}
            />
            <SwitchRow
              label="Mirror front camera"
              description="Flip selfie preview horizontally"
              value={settings.mirror}
              onValueChange={(v) => handleSwitch('mirror', v)}
            />
            <SwitchRow
              label="Animate shutter"
              description="Show the shutter pulse on capture"
              value={settings.animateShutter}
              onValueChange={(v) => handleSwitch('animateShutter', v)}
            />
            <SwitchRow
              label="Skip processing"
              description="Faster capture. Image may be rotated incorrectly on some devices."
              value={settings.skipProcessing}
              onValueChange={(v) => handleSwitch('skipProcessing', v)}
            />
            <SwitchRow
              label="Auto-capture when aligned"
              description="Fire shutter automatically at 95% match (held for 1.5s)"
              value={settings.autoCapture}
              onValueChange={(v) => handleSwitch('autoCapture', v)}
            />
          </ScrollView>
        </ThemedSurface>
      </View>
    </Modal>
  );
}

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View style={styles.section}>
      <ThemedText variant="titleSmall" weight="600" tone="secondary" style={styles.sectionLabel}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

interface SegmentedRowProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onSelect: (next: T) => void;
}

function SegmentedRow<T extends string | number>({ options, value, onSelect }: SegmentedRowProps<T>) {
  const { theme } = useTheme();
  return (
    <View style={styles.segmentedRow}>
      {options.map((opt) => (
        <Segment
          key={String(opt.value)}
          label={opt.label}
          active={opt.value === value}
          onPress={() => onSelect(opt.value)}
          accent={theme.accent}
          borderColor={theme.glassBorder}
          surfaceColor={theme.background.tertiary}
          textColor={theme.text.primary}
        />
      ))}
    </View>
  );
}

interface SegmentProps {
  label: string;
  active: boolean;
  onPress: () => void;
  accent: string;
  borderColor: string;
  surfaceColor: string;
  textColor: string;
  disabled?: boolean;
}

function Segment({
  label,
  active,
  onPress,
  accent,
  borderColor,
  surfaceColor,
  textColor,
  disabled = false,
}: SegmentProps) {
  const onAccent = readableTextOn(accent);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.segment,
        {
          borderColor: active ? accent : borderColor,
          backgroundColor: active ? accent : surfaceColor,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}>
      <ThemedText variant="bodySmall" weight="600" style={{ color: active ? onAccent : textColor }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}

function SwitchRow({ label, description, value, onValueChange }: SwitchRowProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.switchRow, { borderTopColor: theme.glassBorder }]}>
      <View style={styles.switchText}>
        <ThemedText variant="bodyMedium" weight="600">
          {label}
        </ThemedText>
        {description ? (
          <ThemedText variant="caption" tone="secondary">
            {description}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.background.tertiary, true: theme.accent }}
        thumbColor={theme.text.primary}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    // Backdrop scrim — translucent black sits over the camera preview so the
    // sheet has visual separation. The Pressable absoluteFill above provides
    // the dismiss-on-outside-tap behaviour; the colour lives on the wrapper.
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: Radius.cardLg,
    borderTopRightRadius: Radius.cardLg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  segment: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    flexBasis: 0,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
});
