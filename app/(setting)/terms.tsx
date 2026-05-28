import { StyleSheet, Text, View } from 'react-native';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';
import { useT } from '../../libs/i18n';

const SECTION_KEYS = [
  'acceptableUse',
  'credentials',
  'content',
  'subscriptions',
  'ads',
  'noWarranty',
  'changes',
] as const;

export default function TermsScreen() {
  const { theme } = useTheme();
  const t = useT();

  return (
    <SettingsScreenLayout title={t('settings.termsLong')} subtitle={t('settings.termsScreen.subtitle')}>
      <Text style={[styles.lead, { color: theme.text.primary }]}>
        {t('settings.termsScreen.lead')}
      </Text>
      {SECTION_KEYS.map((key) => (
        <View
          key={key}
          style={[
            styles.card,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>{t(`settings.termsScreen.section.${key}.title`)}</Text>
          <Text style={[styles.body, { color: theme.text.secondary }]}>{t(`settings.termsScreen.section.${key}.body`)}</Text>
        </View>
      ))}
      <Text style={[styles.updated, { color: theme.text.tertiary }]}>
        {t('settings.termsScreen.effective')}
      </Text>
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  lead: {
    ...Typography.titleLarge,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 6,
  },
  sectionTitle: {
    ...Typography.titleMedium,
  },
  body: {
    ...Typography.bodyMedium,
    lineHeight: 22,
  },
  updated: {
    ...Typography.captionSmall,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
