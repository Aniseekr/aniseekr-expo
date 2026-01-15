import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Alert, Image, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import ImagePicker, { ImagePickerResponse, Asset, MediaType } from 'expo-image-picker';

interface AvatarUploaderProps {
  currentAvatarUrl?: string;
  onAvatarUpload: (url: string) => void;
}

export function AvatarUploader({ currentAvatarUrl, onAvatarUpload }: AvatarUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handlePickImage = useCallback(async () => {
    if (isUploading) return;

    try {
      setIsUploading(true);

      let result: ImagePickerResponse;

      if (Platform.OS === 'ios') {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          selectionLimit: 1,
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: true,
          aspect: [4, 3],
        });
      }

      if (result.canceled) {
        setIsUploading(false);
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const asset = result.assets[0];

        if (asset.fileSize > 5 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Please select an image smaller than 5MB');
          setIsUploading(false);
          return;
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        const uploadResult = await handleUpload(asset);

        setIsUploading(false);

        if (uploadResult) {
          onAvatarUpload(uploadResult);
        }
      }
    } catch (error) {
      setIsUploading(false);
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  }, [isUploading, onAvatarUpload]);

  const handleUpload = async (asset: Asset): Promise<string> => {
    const formData = new FormData();
    formData.append('avatar', {
      uri: asset.uri,
      type: asset.type || 'image/jpeg',
      name: `avatar_${Date.now()}.jpg`,
    });

    const response = await fetch('https://api.example.com/upload', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const data = await response.json();
    return data.url;
  };

  return (
    <View style={styles.container}>
      <View style={styles.currentAvatarContainer}>
        <Text style={styles.label}>Current Avatar</Text>
        {currentAvatarUrl && (
          <Image source={{ uri: currentAvatarUrl }} style={styles.currentAvatar} />
        )}
      </View>

      <TouchableOpacity
        style={[styles.uploadButton, isUploading && styles.uploadButtonDisabled]}
        onPress={handlePickImage}
        disabled={isUploading}
        activeOpacity={0.7}>
        <Text style={styles.uploadButtonText}>
          {isUploading ? 'Uploading...' : 'Change Avatar'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.info}>Pick from camera or gallery</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 20,
  },

  currentAvatarContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },

  currentAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },

  uploadButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  uploadButtonDisabled: {
    backgroundColor: 'rgba(251, 191, 36, 0.5)',
  },

  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  info: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 12,
  },
});
