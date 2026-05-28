import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Size, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import {
  ThemedSurface,
  ThemedText,
  readableTextOn,
} from '../../components/themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useT } from '../../libs/i18n';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Row {
  key: string;
  icon: IoniconName;
  label: string;
  description?: string;
  beta?: boolean;
  onPress: () => void;
}

export default function AdvancedScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();

  const syncRows: Row[] = [
    {
      key: 'sync-hub',
      icon: 'git-branch-outline',
      label: t('settings.syncHub'),
      description: t('settings.advanced.syncHubDesc'),
      beta: true,
      onPress: () => router.push('/(setting)/sync-hub'),
    },
  ];

  const diagnosticsRows: Row[] = [
    {
      key: 'camera-diagnostics',
      icon: 'camera-outline',
      label: t('settings.advanced.cameraDiagnostics'),
      description: t('settings.advanced.cameraDiagnosticsDesc'),
      onPress: () => router.push('/(setting)/camera-diagnostics'),
    },
    {
      key: 'otaku-dna',
      icon: 'finger-print-outline',
      label: t('settings.otakuDna.title'),
      description: t('settings.advanced.otakuDnaDesc'),
      onPress: () => router.push('/(setting)/otaku-dna'),
    },
    {
      key: 'language',
      icon: 'language-outline',
      label: t('settings.language'),
      description: t('settings.advanced.languageDesc'),
      beta: true,
      onPress: () => router.push('/(setting)/language'),
    },
    {
      key: 'import-wizard',
      icon: 'cloud-upload-outline',
      label: t('settings.importWizard.title'),
      description: t('settings.advanced.importWizardDesc'),
      beta: true,
      onPress: () => router.push('/(setting)/import-wizard'),
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.header, { paddingTop: insets.top > 0 ? 0 : Spacing.sm }]}>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              router.back();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <Ionicons name="arrow-back" size={20} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <ThemedText variant="titleLarge" weight="700">
              {t('settings.advanced.title')}
            </ThemedText>
            <ThemedText variant="bodySmall" tone="secondary">
              {t('settings.advanced.subtitle')}
            </ThemedText>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + Spacing.xl * 2 },
          ]}
          showsVerticalScrollIndicator={false}>
          <Section title={t('settings.advanced.section.sync')} rows={syncRows} />
          <Section title={t('settings.advanced.section.diagnostics')} rows={diagnosticsRows} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <View style={styles.section}>
      <ThemedText
        variant="captionSmall"
        tone="secondary"
        weight="600"
        style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      <ThemedSurface variant="card" padded={false} style={styles.sectionCard}>
        {rows.map((row, idx) => (
          <AdvancedRow key={row.key} row={row} divider={idx < rows.length - 1} />
        ))}
      </ThemedSurface>
    </View>
  );
}

function AdvancedRow({ row, divider }: { row: Row; divider: boolean }) {
  const { theme } = useTheme();
  return (
    <View>
      <Pressable
        onPress={() => {
          hapticsBridge.selection();
          row.onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={row.label}
        style={({ pressed }) => [
          styles.row,
          pressed && { backgroundColor: theme.background.tertiary },
        ]}>
        <View style={[styles.rowIcon, { backgroundColor: theme.background.tertiary }]}>
          <Ionicons name={row.icon} size={18} color={theme.accent} />
        </View>
        <View style={styles.rowText}>
          <ThemedText variant="titleMedium" numberOfLines={1}>
            {row.label}
          </ThemedText>
          {row.description ? (
            <ThemedText variant="bodySmall" tone="secondary" numberOfLines={2}>
              {row.description}
            </ThemedText>
          ) : null}
        </View>
        {row.beta ? <BetaPill /> : null}
        <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
      </Pressable>
      {divider ? (
        <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
      ) : null}
    </View>
  );
}

function BetaPill() {
  const { theme } = useTheme();
  const t = useT();
  const fg = readableTextOn(theme.accent);
  return (
    <View style={[styles.betaPill, { backgroundColor: theme.accent }]}>
      <ThemedText
        variant="captionSmall"
        weight="800"
        style={[styles.betaPillText, { color: fg }]}>
        {t('settings.advanced.beta')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  backButton: {
    width: Size.minTouchTarget,
    height: Size.minTouchTarget,
    borderRadius: Size.minTouchTarget / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    gap: 2,
  },
  headerSpacer: {
    width: Size.minTouchTarget,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionTitle: {
    letterSpacing: 1,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sectionCard: {
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm + 2,
    minHeight: Size.minTouchTarget,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: 1,
    marginLeft: Spacing.md + 32,
  },
  betaPill: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  betaPillText: {
    letterSpacing: 1,
  },
});
