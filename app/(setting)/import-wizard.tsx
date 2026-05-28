import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';
import { ThemedButton, readableTextOn } from '../../components/themed';
import { useT } from '../../libs/i18n';

type ImportSource = 'mal' | 'anilist' | 'kitsu' | 'csv';
type Step = 'source' | 'mode' | 'confirm';
type ConflictMode = 'merge' | 'overwrite' | 'skip';

const SOURCES: {
  id: ImportSource;
  nameKey: string;
  descKey: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
}[] = [
  {
    id: 'mal',
    nameKey: 'settings.importWizard.source.mal.name',
    descKey: 'settings.importWizard.source.mal.desc',
    icon: 'data-usage',
    color: '#2E51A2',
  },
  {
    id: 'anilist',
    nameKey: 'settings.importWizard.source.anilist.name',
    descKey: 'settings.importWizard.source.anilist.desc',
    icon: 'public',
    color: '#02A9FF',
  },
  {
    id: 'kitsu',
    nameKey: 'settings.importWizard.source.kitsu.name',
    descKey: 'settings.importWizard.source.kitsu.desc',
    icon: 'collections',
    color: '#F75239',
  },
  {
    id: 'csv',
    nameKey: 'settings.importWizard.source.csv.name',
    descKey: 'settings.importWizard.source.csv.desc',
    icon: 'insert-drive-file',
    color: '#5E5CE6',
  },
];

const MODES: { id: ConflictMode; labelKey: string; descKey: string }[] = [
  {
    id: 'merge',
    labelKey: 'settings.importWizard.mode.merge.label',
    descKey: 'settings.importWizard.mode.merge.desc',
  },
  {
    id: 'overwrite',
    labelKey: 'settings.importWizard.mode.overwrite.label',
    descKey: 'settings.importWizard.mode.overwrite.desc',
  },
  {
    id: 'skip',
    labelKey: 'settings.importWizard.mode.skip.label',
    descKey: 'settings.importWizard.mode.skip.desc',
  },
];

export default function ImportWizardScreen() {
  const { theme } = useTheme();
  const t = useT();
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
    <SettingsScreenLayout title={t('settings.importWizard.title')} subtitle={t('settings.importWizard.subtitle')}>
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
                  <MaterialIcons name="check" size={14} color={readableTextOn(theme.accent)} />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      {
                        color: active
                          ? readableTextOn(theme.accent)
                          : theme.text.secondary,
                      },
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
                {s === 'source' ? t('settings.importWizard.step.source') : s === 'mode' ? t('settings.importWizard.step.mode') : t('settings.importWizard.step.confirm')}
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
                  <Text style={[styles.sourceName, { color: theme.text.primary }]}>{t(s.nameKey)}</Text>
                  <Text style={[styles.sourceDesc, { color: theme.text.secondary }]}>
                    {t(s.descKey)}
                  </Text>
                </View>
                {active ? (
                  <MaterialIcons name="check-circle" size={20} color={theme.accent} />
                ) : null}
              </Pressable>
            );
          })}
          <ThemedButton
            label={t('common.continue')}
            disabled={!source}
            onPress={() => next('mode')}
            fullWidth
            size="md"
          />
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
                  <Text style={[styles.modeLabel, { color: theme.text.primary }]}>{t(m.labelKey)}</Text>
                  <Text style={[styles.modeDesc, { color: theme.text.secondary }]}>
                    {t(m.descKey)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <ThemedButton
                variant="secondary"
                label={t('common.back')}
                onPress={() => next('source')}
                fullWidth
              />
            </View>
            <View style={styles.rowItem}>
              <ThemedButton label={t('common.continue')} onPress={() => next('confirm')} fullWidth />
            </View>
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
            <SummaryRow label={t('settings.importWizard.summary.source')} value={(() => {
              const s = SOURCES.find((x) => x.id === source);
              return s ? t(s.nameKey) : '—';
            })()} />
            <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
            <SummaryRow
              label={t('settings.importWizard.summary.mode')}
              value={(() => {
                const m = MODES.find((x) => x.id === mode);
                return m ? t(m.labelKey) : '—';
              })()}
            />
            <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
            <SummaryRow label={t('settings.importWizard.summary.backup')} value={t('common.enabled')} />
          </View>

          <Text style={[styles.note, { color: theme.text.tertiary }]}>
            {t('settings.importWizard.note')}
          </Text>

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <ThemedButton
                variant="secondary"
                label={t('common.back')}
                onPress={() => next('mode')}
                fullWidth
              />
            </View>
            <View style={styles.rowItem}>
              <ThemedButton label={t('settings.importWizard.startCta')} onPress={finish} fullWidth haptic="success" />
            </View>
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
  rowItem: {
    flex: 1,
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
