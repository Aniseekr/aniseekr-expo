import { StyleSheet, Text, View } from 'react-native';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { SettingsScreenLayout } from '../../components/setting/SettingsScreenLayout';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What we store locally',
    body: 'Aniseekr keeps your folders, ratings, theme choices, and notification preferences on your device. Nothing is uploaded to our servers without your action.',
  },
  {
    title: 'Third-party platforms',
    body: 'When you connect AniList, MAL, Bangumi, or another platform, requests go directly between your device and that platform. We do not proxy or log those requests.',
  },
  {
    title: 'Analytics',
    body: 'No third-party analytics SDK is bundled. Crash logs surface only as on-device console output and never leave your phone unless you choose to share them.',
  },
  {
    title: 'Notifications',
    body: 'Episode reminders are scheduled by the OS (Apple Push / Google FCM is not used). Disabling notifications system-wide will stop all reminders immediately.',
  },
  {
    title: 'Your data, your control',
    body: 'You can clear caches, delete folders, or sign out from connected platforms at any time. Cleared data cannot be recovered.',
  },
];

export default function PrivacyScreen() {
  const { theme } = useTheme();

  return (
    <SettingsScreenLayout title="Privacy policy" subtitle="What happens to your data">
      <Text style={[styles.lead, { color: theme.text.primary }]}>
        Aniseekr is built on the principle that your library belongs to you.
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
        Last updated: January 2026
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
