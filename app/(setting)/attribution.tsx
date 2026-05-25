import { Linking, StyleSheet, Text, View } from 'react-native';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import {
  SettingsScreenLayout,
  SettingsRow,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface Source {
  name: string;
  url: string;
  description: string;
  icon: 'public' | 'data-usage' | 'language' | 'translate' | 'place' | 'collections';
}

const DATA_SOURCES: Source[] = [
  {
    name: 'AniList',
    url: 'https://anilist.co/',
    description: 'Primary anime metadata, scoring, and seasonal listings',
    icon: 'public',
  },
  {
    name: 'MyAnimeList',
    url: 'https://myanimelist.net/',
    description: 'Cross-platform ratings and community lists',
    icon: 'data-usage',
  },
  {
    name: 'Bangumi',
    url: 'https://bgm.tv/',
    description: 'Chinese-community anime database & scoring',
    icon: 'translate',
  },
  {
    name: 'Kitsu',
    url: 'https://kitsu.io/',
    description: 'Anime catalog and streaming aggregation',
    icon: 'collections',
  },
  {
    name: 'Annict',
    url: 'https://annict.com/',
    description: 'Japanese seasonal tracking',
    icon: 'language',
  },
  {
    name: 'Jikan / MAL',
    url: 'https://jikan.moe/',
    description: 'Open MAL REST mirror for cross-platform fallback',
    icon: 'data-usage',
  },
  {
    name: 'Anitabi',
    url: 'https://www.anitabi.cn/',
    description: 'Real-world anime pilgrimage spots',
    icon: 'place',
  },
];

const MAP_SOURCES: Source[] = [
  {
    name: 'OpenStreetMap',
    url: 'https://www.openstreetmap.org/copyright',
    description: 'Map data © OpenStreetMap contributors, available under the ODbL',
    icon: 'place',
  },
  {
    name: 'CARTO Basemaps',
    url: 'https://carto.com/attributions',
    description: 'Voyager / Positron / Dark Matter raster tiles for the pilgrimage map',
    icon: 'place',
  },
];

const LIBRARIES = [
  'Expo Router',
  'React Native Reanimated',
  'expo-image',
  'expo-blur',
  'react-native-gesture-handler',
  'react-native-safe-area-context',
];

export default function AttributionScreen() {
  const { theme } = useTheme();

  const open = (url: string) => {
    hapticsBridge.tap();
    Linking.openURL(url).catch(() => {
      hapticsBridge.error();
    });
  };

  return (
    <SettingsScreenLayout title="Attribution" subtitle="The data and tools we stand on">
      <Text style={[styles.intro, { color: theme.text.secondary }]}>
        Aniseekr aggregates information from these excellent sources. Tap any entry to open the
        project page.
      </Text>

      <SettingsSection title="Anime data">
        {DATA_SOURCES.map((src, idx) => (
          <View key={src.name}>
            <SettingsRow
              icon={src.icon}
              label={src.name}
              description={src.description}
              onPress={() => open(src.url)}
            />
            {idx < DATA_SOURCES.length - 1 ? (
              <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
            ) : null}
          </View>
        ))}
      </SettingsSection>

      <SettingsSection title="Maps & geodata">
        {MAP_SOURCES.map((src, idx) => (
          <View key={src.name}>
            <SettingsRow
              icon={src.icon}
              label={src.name}
              description={src.description}
              onPress={() => open(src.url)}
            />
            {idx < MAP_SOURCES.length - 1 ? (
              <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
            ) : null}
          </View>
        ))}
      </SettingsSection>

      <SettingsSection title="Open-source libraries">
        <View style={styles.tagsRow}>
          {LIBRARIES.map((lib) => (
            <View
              key={lib}
              style={[
                styles.tag,
                {
                  backgroundColor: theme.background.tertiary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <Text style={[styles.tagText, { color: theme.text.primary }]}>{lib}</Text>
            </View>
          ))}
        </View>
      </SettingsSection>

      <Text style={[styles.footer, { color: theme.text.tertiary }]}>
        Trademarks belong to their respective owners. Aniseekr is not affiliated with any of the
        services listed above.
      </Text>
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...Typography.bodyMedium,
    paddingHorizontal: 4,
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: Spacing.sm,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  tagText: {
    ...Typography.captionSmall,
    fontWeight: '600',
  },
  footer: {
    ...Typography.captionSmall,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
});
