import { ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface SettingsScreenLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  rightSlot?: ReactNode;
  scrollable?: boolean;
  contentStyle?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function SettingsScreenLayout({
  title,
  subtitle,
  children,
  rightSlot,
  scrollable = true,
  contentStyle,
  refreshing,
  onRefresh,
}: SettingsScreenLayoutProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const Body = scrollable ? ScrollView : View;
  const bodyProps = scrollable
    ? {
        contentContainerStyle: [
          styles.content,
          { paddingBottom: insets.bottom + 120 },
          contentStyle,
        ],
        showsVerticalScrollIndicator: false,
        refreshControl: onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={theme.text.primary}
          />
        ) : undefined,
      }
    : { style: [styles.content, contentStyle] };

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
            style={[
              styles.backButton,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <MaterialIcons name="arrow-back" size={20} color={theme.text.primary} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[styles.title, { color: theme.text.primary }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: theme.text.secondary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View style={styles.rightSlot}>{rightSlot ?? <View style={{ width: 36 }} />}</View>
        </View>
        <Body {...(bodyProps as any)}>{children}</Body>
      </SafeAreaView>
    </View>
  );
}

interface SectionProps {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
}
export function SettingsSection({ title, children, style }: SectionProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: theme.text.secondary }]}>{title}</Text>
      ) : null}
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        ]}>
        {children}
      </View>
    </View>
  );
}

interface SettingsRowProps {
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value?: string;
  description?: string;
  onPress?: () => void;
  rightSlot?: ReactNode;
  destructive?: boolean;
}
export function SettingsRow({
  icon,
  label,
  value,
  description,
  onPress,
  rightSlot,
  destructive,
}: SettingsRowProps) {
  const { theme } = useTheme();
  const labelColor = destructive ? '#FF453A' : theme.text.primary;

  return (
    <Pressable
      onPress={() => {
        if (onPress) {
          hapticsBridge.selection();
          onPress();
        }
      }}
      style={({ pressed }) => [styles.row, { opacity: pressed && onPress ? 0.7 : 1 }]}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: theme.background.tertiary }]}>
          <MaterialIcons name={icon} size={18} color={destructive ? '#FF453A' : theme.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
        {description ? (
          <Text style={[styles.rowDescription, { color: theme.text.secondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[styles.rowValue, { color: theme.text.secondary }]}>{value}</Text>
      ) : null}
      {rightSlot ??
        (onPress ? (
          <MaterialIcons name="chevron-right" size={20} color={theme.text.tertiary} />
        ) : null)}
    </Pressable>
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
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightSlot: {
    minWidth: 36,
    alignItems: 'flex-end',
  },
  title: {
    ...Typography.titleLarge,
  },
  subtitle: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm + 2,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...Typography.titleMedium,
  },
  rowDescription: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  rowValue: {
    ...Typography.bodyMedium,
  },
});
