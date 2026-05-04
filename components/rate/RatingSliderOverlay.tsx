import { memo, useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { RatingSlider } from '../common/RatingSlider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - Spacing.md * 2, 360);

interface RatingSliderOverlayProps {
  visible: boolean;
  initialValue?: number;
  title?: string;
  subtitle?: string;
  onCancel: () => void;
  onConfirm: (value: number) => void;
}

function RatingSliderOverlayComponent({
  visible,
  initialValue = 5,
  title = 'Rate this anime',
  subtitle,
  onCancel,
  onConfirm,
}: RatingSliderOverlayProps) {
  const { theme } = useTheme();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  if (!visible) return null;

  const handleConfirm = () => {
    hapticsBridge.success();
    onConfirm(value);
  };
  const handleCancel = () => {
    hapticsBridge.tap();
    onCancel();
  };

  return (
    <Modal transparent animationType="none" onRequestClose={handleCancel}>
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(160)}
        style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleCancel}>
          <BlurView intensity={26} tint="systemThickMaterialDark" style={StyleSheet.absoluteFill} />
        </Pressable>

        <Animated.View
          entering={FadeInUp.springify().damping(18)}
          style={[
            styles.card,
            {
              width: CARD_WIDTH,
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <Text style={[styles.title, { color: theme.text.primary }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.text.secondary }]}>{subtitle}</Text>
          ) : null}

          <View style={styles.scoreRow}>
            <Text style={[styles.score, { color: theme.accent }]}>{value.toFixed(1)}</Text>
            <Text style={[styles.scoreMax, { color: theme.text.tertiary }]}>/ 10</Text>
          </View>

          <RatingSlider
            value={value}
            onChange={setValue}
            width={CARD_WIDTH - Spacing.md * 2}
            step={0.5}
          />

          <View style={styles.scaleRow}>
            <Text style={[styles.scaleLabel, { color: theme.text.tertiary }]}>0</Text>
            <Text style={[styles.scaleLabel, { color: theme.text.tertiary }]}>5</Text>
            <Text style={[styles.scaleLabel, { color: theme.text.tertiary }]}>10</Text>
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              onPress={handleCancel}
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                { borderColor: theme.glassBorder, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Text style={[styles.cancelLabel, { color: theme.text.secondary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
              ]}>
              <Text style={styles.confirmLabel}>Save rating</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  title: {
    ...Typography.headlineSmall,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    marginVertical: Spacing.sm,
  },
  score: {
    fontSize: 56,
    fontWeight: '800',
  },
  scoreMax: {
    fontSize: 20,
    fontWeight: '600',
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 4,
    marginBottom: Spacing.sm,
  },
  scaleLabel: {
    ...Typography.captionSmall,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelLabel: {
    ...Typography.titleMedium,
  },
  confirmLabel: {
    ...Typography.titleMedium,
    color: '#0E0A06',
    fontWeight: '700',
  },
});

export const RatingSliderOverlay = memo(RatingSliderOverlayComponent);
