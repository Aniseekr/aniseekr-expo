import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface Clipboard {
  setStringAsync(value: string): Promise<unknown>;
}
let clipboardModule: Clipboard | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  clipboardModule = require('expo-clipboard');
} catch {
  clipboardModule = null;
}

const BG = '#0A0A0A';
const SURFACE = '#1A1A1A';
const SURFACE_ELEVATED = '#141414';
const BORDER = '#2A2A2A';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_SECONDARY = '#8A8A8A';
const TEXT_MUTED = '#525252';

type Category = 'all' | 'accent' | 'surface' | 'text' | 'brand';

interface Token {
  name: string;
  variable: string;
  hex: string;
  category: Exclude<Category, 'all'>;
}

const TOKENS: Token[] = [
  // Accents
  { name: 'Orange', variable: 'accent-orange', hex: '#FF9900', category: 'accent' },
  { name: 'Red', variable: 'accent-red', hex: '#FF3B30', category: 'accent' },
  { name: 'Gold', variable: 'accent-gold', hex: '#FFD700', category: 'accent' },
  { name: 'Green', variable: 'accent-green', hex: '#32D74B', category: 'accent' },
  { name: 'Cyan', variable: 'accent-cyan', hex: '#00BCD4', category: 'accent' },
  { name: 'Blue', variable: 'accent-blue', hex: '#007AFF', category: 'accent' },
  { name: 'Purple', variable: 'accent-purple', hex: '#AF52DE', category: 'accent' },
  // Surface
  { name: 'Background', variable: 'bg-primary', hex: '#080808', category: 'surface' },
  { name: 'Card', variable: 'bg-card', hex: '#1A1A1A', category: 'surface' },
  { name: 'Elevated', variable: 'bg-elevated', hex: '#242424', category: 'surface' },
  { name: 'Border', variable: 'border-default', hex: '#2A2A2A', category: 'surface' },
  // Text
  { name: 'Primary', variable: 'text-primary', hex: '#FFFFFF', category: 'text' },
  { name: 'Secondary', variable: 'text-secondary', hex: '#8A8A8A', category: 'text' },
  { name: 'Muted', variable: 'text-muted', hex: '#525252', category: 'text' },
  // Brand
  { name: 'Solidarity Purple', variable: 'solidarity-purple', hex: '#5B2D8E', category: 'brand' },
  { name: 'Solidarity Pink', variable: 'solidarity-pink', hex: '#E8A0BF', category: 'brand' },
  { name: 'Solidarity Lavender', variable: 'solidarity-lavender', hex: '#F5EDF8', category: 'brand' },
];

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'accent', label: 'Accent' },
  { id: 'surface', label: 'Surface' },
  { id: 'text', label: 'Text' },
  { id: 'brand', label: 'Brand' },
];

export default function DesignTokensScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const accent = theme.accent;
  const [active, setActive] = useState<Category>('all');
  const [toast, setToast] = useState<string | null>(null);

  const visible = useMemo(
    () => (active === 'all' ? TOKENS : TOKENS.filter((t) => t.category === active)),
    [active]
  );

  const groups = useMemo(() => {
    const order: Token['category'][] = ['accent', 'surface', 'text', 'brand'];
    const seen = new Set<Token['category']>();
    const list: { category: Token['category']; tokens: Token[] }[] = [];
    order.forEach((c) => {
      const tokens = visible.filter((t) => t.category === c);
      if (tokens.length > 0 && !seen.has(c)) {
        seen.add(c);
        list.push({ category: c, tokens });
      }
    });
    return list;
  }, [visible]);

  const copy = async (label: string, text: string) => {
    hapticsBridge.tap();
    if (clipboardModule?.setStringAsync) {
      await clipboardModule.setStringAsync(text);
      setToast(`${label} copied`);
      setTimeout(() => setToast(null), 1400);
    } else {
      setToast('Clipboard unavailable');
      setTimeout(() => setToast(null), 1400);
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.navBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.navBack, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
          </Pressable>
          <Text style={styles.navTitle}>Design Tokens</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.subtitle}>
          {TOKENS.length} tokens · 2 themes (light / dark)
        </Text>

        <View style={styles.chipsRow}>
          {CATEGORIES.map((c) => {
            const isActive = c.id === active;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  hapticsBridge.selection();
                  setActive(c.id);
                }}
                style={({ pressed }) => [
                  styles.chip,
                  isActive
                    ? { backgroundColor: accent, borderColor: accent }
                    : { backgroundColor: SURFACE_ELEVATED, borderColor: BORDER },
                  pressed && { opacity: 0.8 },
                ]}>
                <Text style={[styles.chipText, { color: isActive ? BG : TEXT_PRIMARY }]}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}>
          {groups.map((g) => (
            <View key={g.category} style={{ gap: 10 }}>
              <Text style={styles.groupHeader}>{g.category.toUpperCase()}</Text>
              <View style={styles.tokenList}>
                {g.tokens.map((t, idx) => (
                  <View key={t.variable}>
                    <Pressable
                      onLongPress={() => copy(t.variable, `$${t.variable}`)}
                      onPress={() => copy(t.hex, t.hex)}
                      style={({ pressed }) => [
                        styles.tokenRow,
                        pressed && { backgroundColor: 'rgba(255,255,255,0.03)' },
                      ]}>
                      <View style={[styles.tokenSwatch, { backgroundColor: t.hex, borderColor: BORDER }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tokenName}>{t.name}</Text>
                        <Text style={styles.tokenVar}>${t.variable}</Text>
                      </View>
                      <Text style={styles.tokenHex}>{t.hex}</Text>
                      <Ionicons name="copy-outline" size={14} color={TEXT_MUTED} />
                    </Pressable>
                    {idx < g.tokens.length - 1 ? <View style={styles.separator} /> : null}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.footerLeft}>
            <Ionicons name="document-text-outline" size={14} color={TEXT_SECONDARY} />
            <Text style={styles.footerLeftText}>tokens.ts</Text>
          </View>
          <Pressable
            onPress={() => copy('All tokens', TOKENS.map((t) => `$${t.variable}: ${t.hex}`).join('\n'))}
            style={({ pressed }) => [
              styles.exportBtn,
              { backgroundColor: accent },
              pressed && { opacity: 0.85 },
            ]}>
            <Ionicons name="download-outline" size={14} color={BG} />
            <Text style={styles.exportText}>Export</Text>
          </Pressable>
        </View>

        {toast ? (
          <View style={[styles.toast, { bottom: insets.bottom + 80 }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
  },
  navBack: { minWidth: 24 },
  navTitle: { color: TEXT_PRIMARY, fontSize: 17, fontWeight: '600' },
  subtitle: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  scroll: { padding: 16, gap: 16 },
  groupHeader: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  tokenList: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tokenSwatch: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
  },
  tokenName: { color: TEXT_PRIMARY, fontSize: 14, fontWeight: '600' },
  tokenVar: { color: TEXT_SECONDARY, fontSize: 11, marginTop: 2 },
  tokenHex: { color: TEXT_SECONDARY, fontSize: 12, fontWeight: '600' },
  separator: { height: 1, backgroundColor: BORDER },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerLeftText: { color: TEXT_SECONDARY, fontSize: 12, fontWeight: '500' },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  exportText: { color: BG, fontSize: 13, fontWeight: '700' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: SURFACE_ELEVATED,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  toastText: { color: TEXT_PRIMARY, fontSize: 12, fontWeight: '600' },
});
