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
    title: 'Subscriptions and in-app purchases',
    body:
      'Aniseekr Pro offers the following in-app purchases through Apple:\n\n' +
      '• Aniseekr Pro Monthly — auto-renewing subscription, billed every month.\n' +
      '• Aniseekr Pro Annual — auto-renewing subscription, billed every year.\n' +
      '• Aniseekr Pro Lifetime — one-time purchase, never renews.\n\n' +
      'Payment and billing: Payment is charged to your Apple ID at confirmation of purchase. Auto-renewing subscriptions automatically renew at the same price unless cancelled at least 24 hours before the end of the current period. Your Apple ID will be charged for the next period within 24 hours of the period end. The current price is shown in the paywall before you confirm.\n\n' +
      'Managing and cancelling: You can review, manage, or cancel any subscription at any time in your Apple ID account settings (Settings → [your name] → Subscriptions on iOS). Cancellation takes effect at the end of the current period; you keep Pro features until then.\n\n' +
      'Refunds: Purchases are handled by Apple and are subject to Apple’s standard refund policy. We cannot issue refunds directly; please contact Apple Support to request one.\n\n' +
      'Restoring purchases: Tap “Restore purchases” on the paywall to restore an existing entitlement on a new device or after reinstalling.',
  },
  {
    title: 'Advertisements',
    body: 'Some surfaces may display ads from third-party networks. We are not responsible for ad content; your interactions with ads are subject to the advertiser’s terms.',
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
        Effective date: May 2026
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
