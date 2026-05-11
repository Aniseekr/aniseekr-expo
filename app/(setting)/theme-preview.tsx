import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

const BG = '#0A0A0A';
const SURFACE = '#1A1A1A';
const SURFACE_ALT = '#141414';
const BORDER = '#2A2A2A';
const BORDER_SOFT = '#1F1F1F';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_SECONDARY = '#8A8A8A';
const TEXT_TERTIARY = '#525252';

export default function ThemePreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const accent = theme.accent;

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
            <Text style={styles.navBackText}>Settings</Text>
          </Pressable>
          <Text style={styles.navTitle}>Live Preview</Text>
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              router.push('/(setting)/accent-color');
            }}
            hitSlop={12}
            style={({ pressed }) => [
              styles.switchPill,
              { borderColor: accent },
              pressed && { opacity: 0.7 },
            ]}>
            <View style={[styles.pillDot, { backgroundColor: accent }]} />
            <Text style={[styles.pillText, { color: accent }]}>Switch</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}>
          {/* Hero card */}
          <View style={styles.heroCard}>
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.heroGradient}>
              <View style={styles.heroTop}>
                <View style={[styles.heroBadge, { backgroundColor: accent + 'DD' }]}>
                  <Ionicons name="star" size={10} color={BG} />
                  <Text style={styles.heroBadgeText}>Featured Today</Text>
                </View>
              </View>
              <View style={styles.heroBottom}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>Demon Slayer: Hashira Arc</Text>
                  <Text style={styles.heroMeta}>S4 · E12 · 24 min</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.watchBtn,
                    { backgroundColor: accent },
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Ionicons name="play" size={14} color={BG} />
                  <Text style={styles.watchText}>Watch Now</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </View>

          {/* Filter chips */}
          <View style={styles.chipsRow}>
            <Chip label="Action" active accent={accent} />
            <Chip label="Romance" accent={accent} />
            <Chip label="SF" accent={accent} />
          </View>

          {/* Progress card */}
          <View style={styles.progressCard}>
            <View style={styles.progressRow}>
              <View style={[styles.progressRing, { borderColor: accent + '40' }]}>
                <View
                  style={[
                    styles.progressArc,
                    { borderColor: 'transparent', borderTopColor: accent, borderRightColor: accent },
                  ]}
                />
                <Text style={[styles.progressNum, { color: accent }]}>50%</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.progressLabel}>Currently Watching</Text>
                <Text style={styles.progressTitle}>Ep 12 / 24</Text>
                <Text style={styles.progressSub}>Next: Pillar Showdown</Text>
              </View>
            </View>
          </View>

          {/* Button row */}
          <View style={styles.buttonRow}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: accent },
                pressed && { opacity: 0.85 },
              ]}>
              <Text style={styles.primaryBtnText}>Primary</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.outlineBtn,
                { borderColor: accent },
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={[styles.outlineBtnText, { color: accent }]}>Outline</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.ghostBtnText}>Ghost</Text>
            </Pressable>
          </View>

          {/* Badge row */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: accent + '20', borderColor: accent }]}>
              <Text style={[styles.badgeText, { color: accent }]}>NEW</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: accent + '14', borderColor: accent + '55' }]}>
              <Ionicons name="trending-up" size={11} color={accent} />
              <Text style={[styles.badgeText, { color: accent }]}>Trending</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: SURFACE, borderColor: BORDER }]}>
              <Ionicons name="star" size={11} color={accent} />
              <Text style={[styles.badgeText, { color: TEXT_PRIMARY }]}>8.2</Text>
            </View>
          </View>
        </ScrollView>

        {/* Mock tab bar */}
        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TabItem label="Home" icon="home" active accent={accent} />
          <TabItem label="Search" icon="search" accent={accent} />
          <TabItem label="Library" icon="bookmark" accent={accent} />
          <TabItem label="Profile" icon="person" accent={accent} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Chip({ label, active, accent }: { label: string; active?: boolean; accent: string }) {
  return (
    <View
      style={[
        styles.chip,
        active
          ? { backgroundColor: accent, borderColor: accent }
          : { backgroundColor: SURFACE, borderColor: BORDER },
      ]}>
      <Text style={[styles.chipText, { color: active ? BG : TEXT_PRIMARY }]}>{label}</Text>
    </View>
  );
}

function TabItem({
  label,
  icon,
  active,
  accent,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active?: boolean;
  accent: string;
}) {
  const color = active ? accent : TEXT_TERTIARY;
  return (
    <View style={styles.tabItem}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
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
  navBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 100 },
  navBackText: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '500' },
  navTitle: { color: TEXT_PRIMARY, fontSize: 17, fontWeight: '600' },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 100,
    justifyContent: 'center',
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: '600' },
  scroll: { padding: 16, gap: 14 },
  heroCard: {
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    // simulated image background
    backgroundImageOpacity: 0.6,
  } as any,
  heroGradient: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  heroTop: { flexDirection: 'row' },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  heroBadgeText: { color: BG, fontSize: 10, fontWeight: '700' },
  heroBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  heroTitle: { color: TEXT_PRIMARY, fontSize: 18, fontWeight: '800' },
  heroMeta: { color: TEXT_SECONDARY, fontSize: 12, marginTop: 4 },
  watchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  watchText: { color: BG, fontSize: 13, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  progressCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  progressRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressArc: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 6,
    transform: [{ rotate: '-45deg' }],
  },
  progressNum: { fontSize: 12, fontWeight: '700' },
  progressLabel: { color: TEXT_SECONDARY, fontSize: 11, fontWeight: '500' },
  progressTitle: { color: TEXT_PRIMARY, fontSize: 16, fontWeight: '700', marginTop: 2 },
  progressSub: { color: TEXT_SECONDARY, fontSize: 12, marginTop: 2 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryBtnText: { color: BG, fontSize: 13, fontWeight: '700' },
  outlineBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  outlineBtnText: { fontSize: 13, fontWeight: '700' },
  ghostBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  ghostBtnText: { color: TEXT_SECONDARY, fontSize: 13, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: SURFACE_ALT,
    borderTopWidth: 1,
    borderTopColor: BORDER_SOFT,
    paddingTop: 10,
  },
  tabItem: { alignItems: 'center', gap: 4 },
  tabLabel: { fontSize: 10, fontWeight: '500' },
});
