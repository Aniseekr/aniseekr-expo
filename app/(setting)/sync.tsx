import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { PLATFORM_CONFIGS, PlatformType } from '../../libs/services/auth/types';
import { authService } from '../../libs/services/auth/auth-service';
import { multiPlatformSyncService } from '../../libs/services/sync/multi-platform-sync-service';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';

export default function SyncSettingsScreen() {
  const router = useRouter();
  const [connectedPlatforms, setConnectedPlatforms] = useState<PlatformType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadPlatforms();
  }, []);

  const loadPlatforms = () => {
    setConnectedPlatforms(authService.getConnectedPlatforms());
  };

  const handleConnect = async (platform: PlatformType) => {
    setIsLoading(true);
    try {
      if (PLATFORM_CONFIGS[platform].authType === 'password') {
        Alert.alert('Not Implemented', 'Password auth UI not implemented yet');
      } else if (PLATFORM_CONFIGS[platform].authType === 'apikey') {
        Alert.alert('Not Implemented', 'API Key auth UI not implemented yet');
      } else {
        await authService.connectPlatform(platform);
        loadPlatforms();
      }
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message);
    } finally {
      setIsLoading(false);
    }
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
            await authService.disconnectPlatform(platform);
            loadPlatforms();
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
    </>
  );
}
