import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { UserRepository } from '../../libs/repositories/user-repository';

interface AvatarUploaderProps {
  currentAvatarUrl?: string | null;
  onChange?: (uri: string | null) => void;
}

const AVATAR_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}avatars/` : null;

async function ensureAvatarDir(): Promise<string | null> {
  if (!AVATAR_DIR) return null;
  try {
    const info = await FileSystem.getInfoAsync(AVATAR_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(AVATAR_DIR, { intermediates: true });
    }
  } catch {
    // best-effort
  }
  return AVATAR_DIR;
}

export function AvatarUploader({ currentAvatarUrl, onChange }: AvatarUploaderProps) {
  const [uri, setUri] = useState<string | null>(currentAvatarUrl ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUri(currentAvatarUrl ?? null);
  }, [currentAvatarUrl]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain) {
      const next = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (next.granted) return true;
    }
    Alert.alert('Photo access needed', 'Allow photo library access to choose an avatar.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open settings', onPress: () => Linking.openSettings() },
    ]);
    return false;
  }, []);

  const handlePick = useCallback(async () => {
    if (busy) return;
    const granted = await requestPermission();
    if (!granted) return;

    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const dir = await ensureAvatarDir();
      if (!dir) {
        Alert.alert('Storage unavailable', 'Could not access local storage.');
        return;
      }
      const dest = `${dir}${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: asset.uri, to: dest });

      // Clean up the previous file (if any) before swapping.
      const previous = await UserRepository.getAvatarUri();
      if (previous && previous !== dest) {
        await FileSystem.deleteAsync(previous, { idempotent: true }).catch(() => undefined);
      }

      await UserRepository.setAvatarUri(dest);
      hapticsBridge.success();
      setUri(dest);
      onChange?.(dest);
    } catch (e) {
      console.warn('[AvatarUploader] failed:', e);
      hapticsBridge.error();
      Alert.alert('Could not update avatar', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, requestPermission, onChange]);

  const handleRemove = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await UserRepository.setAvatarUri(null);
      hapticsBridge.warning();
      setUri(null);
      onChange?.(null);
    } finally {
      setBusy(false);
    }
  }, [busy, onChange]);

  return (
    <View style={styles.container}>
      <View style={styles.avatarFrame}>
        {uri ? (
          <Image source={{ uri }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="person" size={48} color={Colors.text.disabled} />
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handlePick}
          disabled={busy}
          style={({ pressed }) => [
            styles.uploadButton,
            { opacity: busy ? 0.6 : pressed ? 0.85 : 1 },
          ]}>
          <Ionicons name="cloud-upload-outline" size={18} color="#0E0A06" />
          <Text style={styles.uploadLabel}>{uri ? 'Change' : 'Upload'}</Text>
        </Pressable>
        {uri ? (
          <Pressable
            onPress={handleRemove}
            disabled={busy}
            style={({ pressed }) => [
              styles.removeButton,
              { opacity: busy ? 0.6 : pressed ? 0.85 : 1 },
            ]}>
            <Text style={styles.removeLabel}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatarFrame: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.glass.borderHeavy,
    backgroundColor: Colors.glass.dark,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  uploadLabel: {
    ...Typography.titleSmall,
    color: '#0E0A06',
    fontWeight: '700',
  },
  removeButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  removeLabel: {
    ...Typography.titleSmall,
    color: Colors.text.secondary,
  },
});
