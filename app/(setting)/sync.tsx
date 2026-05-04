import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, Alert, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { PLATFORM_CONFIGS, PlatformType } from '../../libs/services/auth/types';
import { authService } from '../../libs/services/auth/auth-service';
import { isAuthRequiresFormError, AuthFormKind } from '../../libs/services/auth/auth-errors';
import { multiPlatformSyncService } from '../../libs/services/sync/multi-platform-sync-service';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { PlatformAuthSheet, PlatformAuthInput } from '../../components/auth/PlatformAuthSheet';

interface SheetState {
  visible: boolean;
  platform: PlatformType | null;
  kind: AuthFormKind | null;
  requiresServerUrl: boolean;
}

const HIDDEN_SHEET: SheetState = {
  visible: false,
  platform: null,
  kind: null,
  requiresServerUrl: false,
};

export default function SyncSettingsScreen() {
  const [connectedPlatforms, setConnectedPlatforms] = useState<PlatformType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(HIDDEN_SHEET);

  useEffect(() => {
    loadPlatforms();
  }, []);

  const loadPlatforms = async () => {
    await authService.initialize();
    setConnectedPlatforms(authService.getConnectedPlatforms());
  };

  const handleConnect = async (platform: PlatformType) => {
    setIsLoading(true);
    try {
      await authService.signIn(platform);
      await loadPlatforms();
    } catch (error) {
      if (isAuthRequiresFormError(error)) {
        setSheet({
          visible: true,
          platform,
          kind: error.kind,
          requiresServerUrl: error.requiresServerUrl,
        });
        return;
      }
      Alert.alert('Connection Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSheetSubmit = async (input: PlatformAuthInput) => {
    if (!sheet.platform || !sheet.kind) return;
    if (sheet.kind === 'password') {
      if (!input.username || !input.password) {
        throw new Error('Username and password are required');
      }
      await authService.connectWithPassword(sheet.platform, input.username, input.password);
    } else {
      if (!input.apiKey) {
        throw new Error('API key is required');
      }
      await authService.connectWithApiKey(sheet.platform, input.apiKey, input.serverUrl);
    }
    setSheet(HIDDEN_SHEET);
    await loadPlatforms();
  };

  const handleDisconnect = async (platform: PlatformType) => {
    Alert.alert(
      'Disconnect Platform',
      `Are you sure you want to disconnect ${PLATFORM_CONFIGS[platform].displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await authService.signOut(platform);
            await loadPlatforms();
          },
        },
      ]
    );
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const result = await multiPlatformSyncService.syncAll();
      if (result.errors.length > 0) {
        Alert.alert(
          'Sync Completed with Errors',
          `Synced ${result.items.length} items.\nErrors:\n${result.errors.map((e) => `${e.platform}: ${e.error}`).join('\n')}`
        );
      } else {
        Alert.alert(
          'Sync Successful',
          `Synced ${result.items.length} items from ${connectedPlatforms.length} platforms.`
        );
      }
    } catch (error: any) {
      Alert.alert('Sync Failed', error.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Platform Sync', headerLargeTitle: false }} />
      <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-900">
        <View className="space-y-6 p-4">
          <View className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
            <Text className="mb-2 text-lg font-bold dark:text-white">Sync Status</Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-gray-600 dark:text-gray-300">
                Last synced: {connectedPlatforms.length > 0 ? 'Just now' : 'Never'}
              </Text>
              <AnimatedPressable
                onPress={handleSyncNow}
                disabled={syncing || connectedPlatforms.length === 0}
                style={{
                  backgroundColor:
                    syncing || connectedPlatforms.length === 0 ? '#9ca3af' : '#3b82f6',
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 9999,
                }}>
                {syncing ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="font-semibold text-white">Sync Now</Text>
                )}
              </AnimatedPressable>
            </View>
          </View>

          <View>
            <Text className="mb-4 ml-2 text-lg font-bold dark:text-white">Connected Platforms</Text>
            <View className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
              {Object.values(PLATFORM_CONFIGS).map((config, index) => {
                const isConnected = connectedPlatforms.includes(config.platform);

                return (
                  <View
                    key={config.platform}
                    className={`flex-row items-center justify-between p-4 ${
                      index < Object.values(PLATFORM_CONFIGS).length - 1
                        ? 'border-b border-gray-100 dark:border-gray-700'
                        : ''
                    }`}>
                    <View className="flex-row items-center space-x-3">
                      <View
                        className="h-10 w-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: config.color }}>
                        <Text className="text-sm font-bold text-white">
                          {config.displayName.substring(0, 1)}
                        </Text>
                      </View>
                      <View>
                        <Text className="text-base font-semibold dark:text-white">
                          {config.displayName}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          {isConnected ? 'Connected' : 'Not connected'}
                        </Text>
                      </View>
                    </View>

                    <Switch
                      value={isConnected}
                      onValueChange={() =>
                        isConnected
                          ? handleDisconnect(config.platform)
                          : handleConnect(config.platform)
                      }
                      disabled={isLoading}
                      trackColor={{ false: '#e2e2e2', true: config.color }}
                    />
                  </View>
                );
              })}
            </View>
          </View>

          <Text className="mt-4 text-center text-xs text-gray-400">
            AniSeeker uses local-first storage. Your credentials are stored securely on your device.
          </Text>
        </View>
      </ScrollView>

      <PlatformAuthSheet
        visible={sheet.visible}
        platform={sheet.platform}
        platformName={sheet.platform ? PLATFORM_CONFIGS[sheet.platform].displayName : ''}
        kind={sheet.kind}
        requiresServerUrl={sheet.requiresServerUrl}
        onClose={() => setSheet(HIDDEN_SHEET)}
        onSubmit={handleSheetSubmit}
      />
    </>
  );
}
