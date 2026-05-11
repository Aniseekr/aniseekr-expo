import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '../../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

interface Props {
  title: string;
  children: ReactNode;
  onShare?: () => void;
  contentPaddingBottom?: number;
  scrollable?: boolean;
}

export function StatsExhibitFrame({
  title,
  children,
  onShare,
  contentPaddingBottom,
  scrollable = true,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const body = (
    <View style={[styles.content, { paddingBottom: contentPaddingBottom ?? insets.bottom + 120 }]}>
      {children}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={[theme.background.primary, theme.background.secondary, theme.background.primary]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              router.back();
            }}
            hitSlop={12}
            style={[
              styles.iconBtn,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <MaterialIcons name="arrow-back" size={18} color={theme.text.primary} />
          </Pressable>
          <ThemedText variant="headlineSmall" weight="700" style={styles.title}>
            {title}
          </ThemedText>
          {onShare ? (
            <Pressable
              onPress={() => {
                hapticsBridge.tap();
                onShare();
              }}
              hitSlop={12}
              style={[
                styles.iconBtn,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <MaterialIcons name="ios-share" size={16} color={theme.text.primary} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        {scrollable ? (
          <ScrollView showsVerticalScrollIndicator={false}>{body}</ScrollView>
        ) : (
          body
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.titleLarge,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
});
