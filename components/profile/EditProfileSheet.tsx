import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface EditProfileSheetProps {
  visible: boolean;
  onClose: () => void;
  currentUser?: {
    username: string;
    email: string;
  };
  onSave?: (data: { username?: string; email?: string }) => void;
}

export function EditProfileSheet({ visible, onClose, currentUser, onSave }: EditProfileSheetProps) {
  const [username, setUsername] = useState(currentUser?.username || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    setUsername(currentUser?.username || '');
    setEmail(currentUser?.email || '');
    setIsSaving(false);
  };

  const handleSave = useCallback(() => {
    if (!username.trim() || !email.includes('@')) {
      setIsSaving(true);

      setTimeout(() => {
        onSave({ username: username.trim(), email: email.trim() });
        setIsSaving(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        Alert.alert('Success', 'Profile updated successfully');
      }, 1000);
    } else {
      Alert.alert('Invalid Input', 'Please enter a valid username and email');
    }
  }, [username, email, onSave, setIsSaving]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: visible ? 0 : withSpring(0, { damping: 15, stiffness: 150 }),
      },
    ],
  }));

  return (
    <Animated.View
      style={[styles.overlay, containerStyle]}
      pointerEvents={visible ? 'box-none' : 'auto'}
    >
      <TouchableOpacity
        activeOpacity={visible ? 0 : 1}
        style={styles.backdrop}
        onPress={handleClose}
      >
        <View style={styles.sheet}>
          <View style={styles.handle}>
            <View style={styles.handleBar} />
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>Edit Profile</Text>

            <Text style={styles.sectionLabel}>Username</Text>
            <TextInput
              style={[styles.input, Platform.OS === 'ios' && styles.inputIOS]}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter username"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSaving}
            />

            <Text style={styles.sectionLabel}>Email</Text>
            <TextInput
              style={[styles.input, Platform.OS === 'ios' && styles.inputIOS]}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter email"
              keyboardType="email-address"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSaving}
            />

            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.7}
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
        >
          <Text style={styles.closeButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },

  sheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: Platform.select({ ios: 34, android: 20 }),
  },

  handle: {
    position: 'absolute',
    top: Platform.select({ ios: 10, android: 20 }),
    left: 0,
    right: 0,
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
  },

  handleBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: 40,
    height: 5,
    backgroundColor: '#2d2d2d',
    borderRadius: 2.5,
  },

  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },

  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },

  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 12,
    marginTop: 8,
  },

  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },

  inputIOS: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },

  saveButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },

  saveButtonDisabled: {
    backgroundColor: 'rgba(251, 191, 36, 0.3)',
  },

  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
});
