import { Linking, StyleSheet, Text, View } from 'react-native';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import {
  SettingsScreenLayout,
  SettingsRow,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useT } from '../../libs/i18n';

interface Source {
  name: string;
  url: string;
  descKey: string;
  icon: 'public' | 'data-usage' | 'language' | 'translate' | 'place' | 'collections';
}

const DATA_SOURCES: Source[] = [
  {
    name: 'AniList',
    url: 'https://anilist.co/',
    descKey: 'settings.attribution.source.anilist',
    icon: 'public',
  },
  {
    name: 'MyAnimeList',
    url: 'https://myanimelist.net/',
    descKey: 'settings.attribution.source.myanimelist',
    icon: 'data-usage',
  },
  {
    name: 'Bangumi',
    url: 'https://bgm.tv/',
    descKey: 'settings.attribution.source.bangumi',
    icon: 'translate',
  },
  {
    name: 'Kitsu',
    url: 'https://kitsu.io/',
    descKey: 'settings.attribution.source.kitsu',
    icon: 'collections',
  },
  {
    name: 'Annict',
    url: 'https://annict.com/',
    descKey: 'settings.attribution.source.annict',
    icon: 'language',
  },
  {
    name: 'Jikan / MAL',
    url: 'https://jikan.moe/',
    descKey: 'settings.attribution.source.jikan',
    icon: 'data-usage',
  },
  {
    name: 'Anitabi',
    url: 'https://www.anitabi.cn/',
    descKey: 'settings.attribution.source.anitabi',
    icon: 'place',
  },
];

const MAP_SOURCES: Source[] = [
  {
    name: 'OpenStreetMap',
    url: 'https://www.openstreetmap.org/copyright',
    descKey: 'settings.attribution.source.osm',
    icon: 'place',
  },
  {
    name: 'CARTO Basemaps',
    url: 'https://carto.com/attributions',
    descKey: 'settings.attribution.source.carto',
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
  const t = useT();

  const open = (url: string) => {
    hapticsBridge.tap();
    Linking.openURL(url).catch(() => {
      hapticsBridge.error();
    });
  };

  return (
    <SettingsScreenLayout title={t('settings.attribution')} subtitle={t('settings.attributionScreen.subtitle')}>
      <Text style={[styles.intro, { color: theme.text.secondary }]}>
        {t('settings.attributionScreen.intro')}
      </Text>

      <SettingsSection title={t('settings.attributionScreen.section.animeData')}>
        {DATA_SOURCES.map((src, idx) => (
          <View key={src.name}>
            <SettingsRow
              icon={src.icon}
              label={src.name}
              description={t(src.descKey)}
              onPress={() => open(src.url)}
            />
            {idx < DATA_SOURCES.length - 1 ? (
              <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
            ) : null}
          </View>
        ))}
      </SettingsSection>

      <SettingsSection title={t('settings.attributionScreen.section.maps')}>
        {MAP_SOURCES.map((src, idx) => (
          <View key={src.name}>
            <SettingsRow
              icon={src.icon}
              label={src.name}
              description={t(src.descKey)}
              onPress={() => open(src.url)}
            />
            {idx < MAP_SOURCES.length - 1 ? (
              <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
            ) : null}
          </View>
        ))}
      </SettingsSection>

      <SettingsSection title={t('settings.attributionScreen.section.libraries')}>
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
        {t('settings.attributionScreen.footer')}
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
