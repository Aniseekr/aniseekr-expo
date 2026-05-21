import { useEffect, useState, useCallback } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';

interface EditDisplayNameSheetProps {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void> | void;
}

export function EditDisplayNameSheet({
  visible,
  currentName,
  onClose,
  onSave,
}: EditDisplayNameSheetProps) {
  const { theme } = useTheme();
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setName(currentName);
  }, [visible, currentName]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Display name', 'Please enter a name.');
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      hapticsBridge.success();
      onClose();
    } catch (e) {
      hapticsBridge.warning();
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [name, onSave, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(160)}
          style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <Animated.View
            entering={FadeInUp.duration(220)}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <SafeAreaView edges={['bottom']}>
              <View style={styles.handle} />
              <View style={styles.headerRow}>
                <Text style={[styles.title, { color: theme.text.primary }]}>Edit display name</Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <MaterialIcons name="close" size={22} color={theme.text.secondary} />
                </Pressable>
              </View>

              <Text style={[styles.helperText, { color: theme.text.secondary }]}>
                Stored on this device only. No account needed.
              </Text>

              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                    color: theme.text.primary,
                  },
                ]}
                value={name}
                onChangeText={setName}
                placeholder="Anime fan"
                placeholderTextColor={theme.text.tertiary}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!saving}
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />

              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={({ pressed }) => [
                  styles.saveButton,
                  { backgroundColor: theme.accent, opacity: saving ? 0.5 : pressed ? 0.85 : 1 },
                ]}>
                <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </SafeAreaView>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: Spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.headlineSmall,
  },
  helperText: {
    ...Typography.bodySmall,
    marginBottom: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.select({ ios: 14, android: 12 }),
    fontSize: 16,
  },
  saveButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0E0A06',
  },
});
