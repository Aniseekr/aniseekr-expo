import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { readableTextOn } from '../../components/themed';
import {
  SettingsScreenLayout,
  SettingsRow,
  SettingsSection,
} from '../../components/setting/SettingsScreenLayout';
import { authService } from '../../libs/services/auth/auth-service';
import { isAuthRequiresFormError } from '../../libs/services/auth/auth-errors';
import type { PlatformType } from '../../libs/services/auth/types';
import { PlatformAuthSheet, PlatformAuthInput } from '../../components/auth/PlatformAuthSheet';
import type { AuthFormKind } from '../../libs/services/auth/auth-errors';
import { useT } from '../../libs/i18n';

interface PlatformDef {
  id: PlatformType;
  name: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
}

const PLATFORMS: PlatformDef[] = [
  { id: 'anilist', name: 'AniList', icon: 'public', color: '#02A9FF' },
  { id: 'myanimelist', name: 'MyAnimeList', icon: 'data-usage', color: '#2E51A2' },
  { id: 'bangumi', name: 'Bangumi', icon: 'translate', color: '#F09199' },
  { id: 'kitsu', name: 'Kitsu', icon: 'collections', color: '#F75239' },
  { id: 'annict', name: 'Annict', icon: 'language', color: '#F65B5B' },
  { id: 'shikimori', name: 'Shikimori', icon: 'public', color: '#1E90FF' },
  { id: 'simkl', name: 'SIMKL', icon: 'movie', color: '#1B1B1B' },
  { id: 'kavita', name: 'Kavita', icon: 'menu-book', color: '#4A8B3C' },
];

type ConnectionState = Record<PlatformType, boolean>;

interface SheetState {
  visible: boolean;
  platform: PlatformDef | null;
  kind: AuthFormKind | null;
  requiresServerUrl: boolean;
}

const HIDDEN_SHEET: SheetState = {
  visible: false,
  platform: null,
  kind: null,
  requiresServerUrl: false,
};

export default function AccountScreen() {
  const { theme } = useTheme();
  const t = useT();
  const [connections, setConnections] = useState<ConnectionState>({} as ConnectionState);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(HIDDEN_SHEET);

  useEffect(() => {
    refreshAll();
  }, []);

  const refreshAll = async () => {
    const next: Partial<ConnectionState> = {};
    for (const p of PLATFORMS) {
      try {
        const token = await authService.getToken(p.id);
        next[p.id] = !!token;
      } catch {
        next[p.id] = false;
      }
    }
    setConnections(next as ConnectionState);
  };

  const handleConnect = async (platform: PlatformDef) => {
    const tag = `[sync-hub:${platform.id}]`;
    console.log(`${tag} connect button pressed`);
    setLoading(true);
    try {
      const creds = await authService.signIn(platform.id);
      console.log(`${tag} signIn returned`, { connected: !!creds });
      hapticsBridge.success();
    } catch (e) {
      if (isAuthRequiresFormError(e)) {
        console.log(`${tag} auth requires form`, { kind: e.kind, requiresServerUrl: e.requiresServerUrl });
        setSheet({
          visible: true,
          platform,
          kind: e.kind,
          requiresServerUrl: e.requiresServerUrl,
        });
        return;
      }
      const errObj = e as { message?: string; code?: string; description?: string; name?: string };
      console.error(`${tag} connect failed`, {
        name: errObj?.name,
        message: errObj?.message,
        code: errObj?.code,
        description: errObj?.description,
        raw: e,
      });
      hapticsBridge.error();
      Alert.alert(
        `Couldn't connect to ${platform.name}`,
        e instanceof Error ? e.message : 'Unknown error'
      );
    } finally {
      await refreshAll();
      setLoading(false);
    }
  };

  const handleSheetSubmit = async (input: PlatformAuthInput) => {
    if (!sheet.platform || !sheet.kind) return;
    const platform = sheet.platform;
    if (sheet.kind === 'password') {
      if (!input.username || !input.password) {
        throw new Error('Username and password are required');
      }
      await authService.connectWithPassword(platform.id, input.username, input.password);
    } else {
      if (!input.apiKey) {
        throw new Error('API key is required');
      }
      await authService.connectWithApiKey(platform.id, input.apiKey, input.serverUrl);
    }
    setSheet(HIDDEN_SHEET);
    await refreshAll();
  };

  const handleDisconnect = (platform: PlatformDef) => {
    Alert.alert(
      `Disconnect ${platform.name}?`,
      `This removes the OAuth token and any cached library, ratings, and progress from ${platform.name} on this device. To also delete data on ${platform.name}'s servers, revoke access in your ${platform.name} account settings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.signOut(platform.id);
              hapticsBridge.warning();
            } catch (e) {
              hapticsBridge.error();
            } finally {
              await refreshAll();
            }
          },
        },
      ]
    );
  };

  const handleDisconnectAll = () => {
    const connectedCount = Object.values(connections).filter(Boolean).length;
    if (connectedCount === 0) {
      Alert.alert(
        'Nothing to disconnect',
        'You are not connected to any platforms on this device.'
      );
      return;
    }
    Alert.alert(
      'Disconnect everything from this device?',
      'This signs you out of every connected platform and erases every stored OAuth token from this device. To also delete data held by each platform, revoke access in their own account settings. To wipe local caches as well, delete the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect all',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.signOut();
              hapticsBridge.warning();
            } catch (e) {
              hapticsBridge.error();
            } finally {
              await refreshAll();
            }
          },
        },
      ]
    );
  };

  return (
    <SettingsScreenLayout title={t('settings.account')} subtitle={t('settings.connectedPlatforms')}>
      <Text style={[styles.intro, { color: theme.text.secondary }]}>
        {t('settings.accountScreen.intro')}
      </Text>

      <SettingsSection title={t('settings.accountScreen.section.platforms')}>
        {PLATFORMS.map((platform, idx) => {
          const connected = !!connections[platform.id];
          return (
            <View key={platform.id}>
              <View style={styles.platformRow}>
                <View style={[styles.platformIcon, { backgroundColor: platform.color + '24' }]}>
                  <MaterialIcons name={platform.icon} size={20} color={platform.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.platformName, { color: theme.text.primary }]}>
                    {platform.name}
                  </Text>
                  <Text
                    style={[
                      styles.platformStatus,
                      { color: connected ? Colors.success : theme.text.tertiary },
                    ]}>
                    {connected ? t('settings.accountScreen.connected') : t('settings.accountScreen.notConnected')}
                  </Text>
                </View>
                {connected ? (
                  <Pressable
                    onPress={() => handleDisconnect(platform)}
                    accessibilityRole="button"
                    accessibilityLabel={`Disconnect ${platform.name}`}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        borderColor: Colors.error + '66',
                        backgroundColor: Colors.error + '14',
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <Text style={[styles.actionLabel, { color: Colors.error }]}>{t('settings.accountScreen.disconnect')}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => handleConnect(platform)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={`Connect ${platform.name}`}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: theme.accent,
                        borderColor: theme.accent,
                        opacity: pressed || loading ? 0.7 : 1,
                      },
                    ]}>
                    <Text
                      style={[styles.actionLabel, { color: readableTextOn(theme.accent) }]}>
                      {t('settings.accountScreen.connect')}
                    </Text>
                  </Pressable>
                )}
              </View>
              {idx < PLATFORMS.length - 1 ? (
                <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
              ) : null}
            </View>
          );
        })}
      </SettingsSection>

      <SettingsSection title={t('settings.accountScreen.section.actions')}>
        <SettingsRow
          icon="cloud-download"
          label={t('settings.accountScreen.refreshTokens')}
          description={t('settings.accountScreen.refreshTokensDesc')}
          onPress={() => {
            hapticsBridge.tap();
            refreshAll();
          }}
        />
        <View style={[styles.divider, { backgroundColor: theme.glassBorder }]} />
        <SettingsRow
          icon="delete-forever"
          label={t('settings.accountScreen.disconnectAll')}
          description={t('settings.accountScreen.disconnectAllDesc')}
          onPress={() => {
            hapticsBridge.tap();
            handleDisconnectAll();
          }}
          destructive
        />
      </SettingsSection>

      <Text style={[styles.footnote, { color: theme.text.tertiary }]}>
        {t('settings.accountScreen.footnote')}
      </Text>

      <PlatformAuthSheet
        visible={sheet.visible}
        platform={sheet.platform?.id ?? null}
        platformName={sheet.platform?.name ?? ''}
        kind={sheet.kind}
        requiresServerUrl={sheet.requiresServerUrl}
        onClose={() => setSheet(HIDDEN_SHEET)}
        onSubmit={handleSheetSubmit}
      />
    </SettingsScreenLayout>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...Typography.bodyMedium,
    paddingHorizontal: 4,
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm + 2,
  },
  platformIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformName: {
    ...Typography.titleMedium,
  },
  platformStatus: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  actionLabel: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
  footnote: {
    ...Typography.captionSmall,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
});
