import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
let AsyncStorage: AsyncStorageLike;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  const memory = new Map<string, string>();
  AsyncStorage = {
    async getItem(k) {
      return memory.get(k) ?? null;
    },
    async setItem(k, v) {
      memory.set(k, v);
    },
  };
}

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
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all(
      TIPS.map(async (tip) => {
        const value = await AsyncStorage.getItem(`@aniseekr/${tip.storageKey}`);
        return [tip.storageKey, value === 'seen'] as const;
      })
    )
      .then((entries) => {
        if (!mounted) return;
        const map = Object.fromEntries(entries);
        setSeen(map);
        setHydrated(true);
      })
      .catch(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!hydrated) return null;

  const tip = TIPS.find((t) => !seen[t.storageKey] && t.shouldShow(context));
  if (!tip) return null;

  const dismiss = async () => {
    hapticsBridge.tap();
    setSeen((prev) => ({ ...prev, [tip.storageKey]: true }));
    try {
      await AsyncStorage.setItem(`@aniseekr/${tip.storageKey}`, 'seen');
    } catch {}
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
