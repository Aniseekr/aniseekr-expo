import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import Animated, { withSpring, useAnimatedStyle } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography } from '../../constants/DesignSystem';

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

  const handleSave = useCallback(async () => {
    if (!username.trim() || !email.includes('@')) {
      Alert.alert('Invalid Input', 'Please enter a valid username and email');
      return;
    }

    setIsSaving(true);
    try {
      await onSave?.({ username: username.trim(), email: email.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Save Failed', e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setIsSaving(false);
    }
  }, [username, email, onSave]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: visible
          ? withSpring(0, { damping: 15, stiffness: 150 })
          : withSpring(400, { damping: 15, stiffness: 150 }),
      },
    ],
  }));

  return (
    <Animated.View
      style={[styles.overlay, containerStyle]}
      pointerEvents={visible ? 'box-none' : 'auto'}>
      <TouchableOpacity
        activeOpacity={visible ? 0 : 1}
        style={styles.backdrop}
        onPress={handleClose}>
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
              placeholderTextColor={Colors.text.placeholder}
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
              placeholderTextColor={Colors.text.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSaving}
            />

            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.7}>
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>Cancel</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },

  sheet: {
    backgroundColor: Colors.background.secondary,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.lg,
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
    backgroundColor: Colors.text.primary,
  },

  handleBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: 40,
    height: 5,
    backgroundColor: Colors.text.disabled,
    borderRadius: 2.5,
  },

  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    flex: 1,
    justifyContent: 'flex-end',
  },

  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
  },

  title: {
    ...Typography.headlineMedium,
    color: Colors.text.primary,
    marginBottom: Spacing.xl,
  },

  sectionLabel: {
    ...Typography.titleMedium,
    color: Colors.text.secondary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },

  input: {
    backgroundColor: Colors.glass.light,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text.primary,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },

  inputIOS: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },

  saveButton: {
    backgroundColor: Colors.warning,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    marginTop: Spacing.xl,
  },

  saveButtonDisabled: {
    backgroundColor: 'rgba(251, 191, 36, 0.3)',
  },

  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },

  closeButton: {
    backgroundColor: Colors.background.primary,
    paddingVertical: 14,
    alignItems: 'center',
  },

  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
});
