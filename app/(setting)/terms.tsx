import { StyleSheet, Text, View } from 'react-native';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Acceptable use',
    body: 'Aniseekr is provided for personal, non-commercial use. Do not abuse the bundled API integrations or attempt to bypass platform-level rate limits.',
  },
  {
    title: 'Account credentials',
    body: 'You are responsible for OAuth tokens stored on your device. Logging out removes them from local secure storage; revoking access on the third-party site is recommended for full removal.',
  },
  {
    title: 'Content',
    body: 'Anime metadata, screenshots, and scoring information remain the property of their respective platforms. Aniseekr displays this content for personal reference only.',
  },
  {
    title: 'No warranty',
    body: 'The app is provided “as is”. While we strive for accuracy, third-party data sources may be unavailable or out of date.',
  },
  {
    title: 'Changes',
    body: 'We may update these terms occasionally. The effective date below reflects the most recent revision; please re-read this page after major updates.',
  },
];

export default function TermsScreen() {
  const { theme } = useTheme();

  return (
    <SettingsScreenLayout title="Terms of service" subtitle="Ground rules for using Aniseekr">
      <Text style={[styles.lead, { color: theme.text.primary }]}>
        By using Aniseekr you agree to the following terms.
      </Text>
      {SECTIONS.map((section) => (
        <View
          key={section.title}
          style={[
            styles.card,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>{section.title}</Text>
          <Text style={[styles.body, { color: theme.text.secondary }]}>{section.body}</Text>
        </View>
      ))}
      <Text style={[styles.updated, { color: theme.text.tertiary }]}>
        Effective date: January 2026
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
