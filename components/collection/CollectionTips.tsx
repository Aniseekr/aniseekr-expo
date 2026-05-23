import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { kvGet, kvSet } from '../../libs/services/storage/app-storage';
import { COLLECTION_TIP_KEY_PREFIX } from '../../libs/services/storage/keys';

const tipMmkvKey = (storageKey: string) => `${COLLECTION_TIP_KEY_PREFIX}${storageKey}`;

interface TipDef {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description: string;
  storageKey: string;
  shouldShow: (ctx: CollectionTipContext) => boolean;
}

interface CollectionTipContext {
  folderCount: number;
  hasUnrated: boolean;
}

const TIPS: TipDef[] = [
  {
    icon: 'create-new-folder',
    title: 'Create your first folder',
    description: 'Group anime by mood, season, or anything you like.',
    storageKey: 'tip:firstFolder',
    shouldShow: (ctx) => ctx.folderCount === 0,
  },
  {
    icon: 'auto-awesome',
    title: 'Quick rate unrated picks',
    description: 'Use the rate shortcut on the floating bar to clear your backlog.',
    storageKey: 'tip:quickRate',
    shouldShow: (ctx) => ctx.hasUnrated,
  },
  {
    icon: 'ios-share',
    title: 'Share your top picks',
    description: 'Switch to Share mode and pick favorites to send a beautiful list.',
    storageKey: 'tip:share',
    shouldShow: (ctx) => ctx.folderCount > 1,
  },
];

interface CollectionTipsProps {
  context: CollectionTipContext;
}

function CollectionTipsComponent({ context }: CollectionTipsProps) {
  const { theme } = useTheme();
  // Seed sync from MMKV — no async hydrate, no `hydrated` flag, no flash of
  // a tip that should be hidden. `seen[storageKey]` is true when the user
  // has already dismissed that tip on this device.
  const [seen, setSeen] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const tip of TIPS) {
      out[tip.storageKey] = kvGet(tipMmkvKey(tip.storageKey)) === 'seen';
    }
    return out;
  });

  const tip = TIPS.find((t) => !seen[t.storageKey] && t.shouldShow(context));
  if (!tip) return null;

  const dismiss = () => {
    hapticsBridge.tap();
    setSeen((prev) => ({ ...prev, [tip.storageKey]: true }));
    kvSet(tipMmkvKey(tip.storageKey), 'seen');
  };

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(180)}
      style={styles.wrap}>
      <LinearGradient
        colors={[theme.accent + '24', theme.accentDark + '14'] as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: theme.glassBorder }]}>
        <View style={[styles.iconWrap, { backgroundColor: theme.accent + '32' }]}>
          <MaterialIcons name={tip.icon} size={22} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text.primary }]}>{tip.title}</Text>
          <Text style={[styles.description, { color: theme.text.secondary }]}>
            {tip.description}
          </Text>
        </View>
        <Pressable onPress={dismiss} hitSlop={12}>
          <MaterialIcons name="close" size={18} color={theme.text.tertiary} />
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
    borderRadius: 16,
    borderWidth: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.titleMedium,
  },
  description: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
});

export const CollectionTips = memo(CollectionTipsComponent);
