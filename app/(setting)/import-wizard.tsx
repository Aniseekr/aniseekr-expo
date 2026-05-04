import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';

type ImportSource = 'mal' | 'anilist' | 'kitsu' | 'csv';
type Step = 'source' | 'mode' | 'confirm';
type ConflictMode = 'merge' | 'overwrite' | 'skip';

const SOURCES: {
  id: ImportSource;
  name: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
}[] = [
  {
    id: 'mal',
    name: 'MyAnimeList XML',
    description: 'Standard MAL export, includes scores and notes',
    icon: 'data-usage',
    color: '#2E51A2',
  },
  {
    id: 'anilist',
    name: 'AniList JSON',
    description: 'Use the official "Export user data" download',
    icon: 'public',
    color: '#02A9FF',
  },
  {
    id: 'kitsu',
    name: 'Kitsu library',
    description: 'JSON export from your Kitsu account settings',
    icon: 'collections',
    color: '#F75239',
  },
  {
    id: 'csv',
    name: 'CSV file',
    description: 'Generic CSV with title / score / status columns',
    icon: 'insert-drive-file',
    color: '#5E5CE6',
  },
];

const MODES: { id: ConflictMode; label: string; description: string }[] = [
  {
    id: 'merge',
    label: 'Merge',
    description: 'Keep existing scores; add anything missing',
  },
  {
    id: 'overwrite',
    label: 'Overwrite',
    description: 'Replace local data with the imported file',
  },
  {
    id: 'skip',
    label: 'Skip duplicates',
    description: 'Only import series not already in your library',
  },
];

export default function ImportWizardScreen() {
  const { theme } = useTheme();
  const [step, setStep] = useState<Step>('source');
  const [source, setSource] = useState<ImportSource | null>(null);
  const [mode, setMode] = useState<ConflictMode>('merge');

  const next = (s: Step) => {
    hapticsBridge.tap();
    setStep(s);
  };

  const finish = () => {
    hapticsBridge.success();
    setStep('source');
    setSource(null);
    setMode('merge');
  };

  return (
    <SettingsScreenLayout title="Import wizard" subtitle="Bring your existing library across">
      <View style={styles.stepIndicator}>
        {(['source', 'mode', 'confirm'] as Step[]).map((s, idx) => {
          const active = step === s;
          const done =
            (step === 'mode' && s === 'source') ||
            (step === 'confirm' && (s === 'source' || s === 'mode'));
          return (
            <View key={s} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: done || active ? theme.accent : theme.background.tertiary,
                  },
                ]}>
                {done ? (
                  <MaterialIcons name="check" size={14} color="#0E0A06" />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      { color: active ? '#0E0A06' : theme.text.secondary },
                    ]}>
                    {idx + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  { color: active ? theme.text.primary : theme.text.tertiary },
                ]}>
                {s === 'source' ? 'Source' : s === 'mode' ? 'Mode' : 'Confirm'}
              </Text>
              {idx < 2 ? (
                <View
                  style={[
                    styles.stepLine,
                    {
                      backgroundColor: done ? theme.accent : theme.background.tertiary,
                    },
                  ]}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      {step === 'source' ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ gap: Spacing.sm }}>
          {SOURCES.map((s) => {
            const active = source === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  hapticsBridge.selection();
                  setSource(s.id);
                }}
                style={({ pressed }) => [
                  styles.sourceCard,
                  {
                    backgroundColor: active ? theme.accent + '24' : theme.background.secondary,
                    borderColor: active ? theme.accent : theme.glassBorder,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <View style={[styles.sourceIcon, { backgroundColor: s.color + '24' }]}>
                  <MaterialIcons name={s.icon} size={22} color={s.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sourceName, { color: theme.text.primary }]}>{s.name}</Text>
                  <Text style={[styles.sourceDesc, { color: theme.text.secondary }]}>
                    {s.description}
                  </Text>
                </View>
                {active ? (
                  <MaterialIcons name="check-circle" size={20} color={theme.accent} />
                ) : null}
              </Pressable>
            );
          })}
          <PrimaryButton label="Continue" disabled={!source} onPress={() => next('mode')} />
        </Animated.View>
      ) : null}

      {step === 'mode' ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ gap: Spacing.sm }}>
          {MODES.map((m) => {
            const active = mode === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => {
                  hapticsBridge.selection();
                  setMode(m.id);
                }}
                style={({ pressed }) => [
                  styles.modeCard,
                  {
                    backgroundColor: active ? theme.accent + '24' : theme.background.secondary,
                    borderColor: active ? theme.accent : theme.glassBorder,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <View
                  style={[
                    styles.radio,
                    { borderColor: active ? theme.accent : theme.glassBorder },
                  ]}>
                  {active ? (
                    <View style={[styles.radioInner, { backgroundColor: theme.accent }]} />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modeLabel, { color: theme.text.primary }]}>{m.label}</Text>
                  <Text style={[styles.modeDesc, { color: theme.text.secondary }]}>
                    {m.description}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <View style={styles.row}>
            <SecondaryButton label="Back" onPress={() => next('source')} />
            <PrimaryButton label="Continue" onPress={() => next('confirm')} />
          </View>
        </Animated.View>
      ) : null}

      {step === 'confirm' ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ gap: Spacing.sm }}>
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <SummaryRow label="Source" value={SOURCES.find((s) => s.id === source)?.name ?? '—'} />
            <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
            <SummaryRow
              label="Conflict mode"
              value={MODES.find((m) => m.id === mode)?.label ?? '—'}
            />
            <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
            <SummaryRow label="Backup before import" value="Enabled" />
          </View>

          <Text style={[styles.note, { color: theme.text.tertiary }]}>
            Importing copies the file into the local cache, validates each row, and writes new
            entries via the collection service. You can cancel mid-flight without affecting your
            current library.
          </Text>

          <View style={styles.row}>
            <SecondaryButton label="Back" onPress={() => next('mode')} />
            <PrimaryButton label="Start import" onPress={finish} />
          </View>
        </Animated.View>
      ) : null}
    </SettingsScreenLayout>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: theme.text.secondary }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: theme.text.primary }]}>{value}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        {
          backgroundColor: theme.accent,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}>
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        { borderColor: theme.glassBorder, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text style={[styles.secondaryLabel, { color: theme.text.secondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    ...Typography.titleSmall,
    fontWeight: '800',
  },
  stepLabel: {
    ...Typography.captionSmall,
    marginTop: 4,
  },
  stepLine: {
    position: 'absolute',
    top: 14,
    left: '60%',
    right: '-40%',
    height: 2,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
    borderRadius: 16,
    borderWidth: 1,
  },
  sourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceName: {
    ...Typography.titleMedium,
  },
  sourceDesc: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
    borderRadius: 16,
    borderWidth: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modeLabel: {
    ...Typography.titleMedium,
  },
  modeDesc: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryLabel: {
    ...Typography.titleMedium,
    color: '#0E0A06',
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryLabel: {
    ...Typography.titleMedium,
    fontWeight: '600',
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  summaryLabel: {
    ...Typography.bodyMedium,
  },
  summaryValue: {
    ...Typography.titleMedium,
  },
  divider: {
    height: 1,
    marginHorizontal: Spacing.md,
  },
  note: {
    ...Typography.captionSmall,
    paddingHorizontal: 4,
  },
});
