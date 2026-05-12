import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { collectionService } from '../../libs/services/collection/collection-service';
import { AnimatedPressable } from '../common/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { readableTextOn } from '../themed';
import type { IoniconsName } from '../../libs/utils/icon-types';

export interface NewFolderData {
  name: string;
  icon: string;
  isShared: boolean;
  isR18: boolean;
}

interface CreateFolderModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
  onCreate?: (data: NewFolderData) => Promise<void>;
  onUpdate?: (id: string, data: NewFolderData) => Promise<void>;
  editing?: { id: string; name: string; icon: string; isR18: boolean; isShared: boolean };
}

const ICONS = [
  'folder',
  'star',
  'heart',
  'bookmark',
  'list',
  'flame',
  'happy',
  'planet',
  'tv',
  'game-controller',
] as const satisfies readonly IoniconsName[];

export function CreateFolderModal({
  visible,
  onClose,
  onCreated,
  onCreate,
  onUpdate,
  editing,
}: CreateFolderModalProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('folder');
  const [isShared, setIsShared] = useState(false);
  const [isR18, setIsR18] = useState(false);
  const [loading, setLoading] = useState(false);

  const isEditMode = !!editing;

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name);
      setIcon(editing.icon || 'folder');
      setIsShared(!!editing.isShared);
      setIsR18(!!editing.isR18);
    } else {
      setName('');
      setIcon('folder');
      setIsShared(false);
      setIsR18(false);
    }
  }, [visible, editing]);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setLoading(true);
    try {
      const data: NewFolderData = {
        name: name.trim(),
        icon,
        isShared,
        isR18,
      };

      if (isEditMode && editing) {
        if (onUpdate) {
          await onUpdate(editing.id, data);
        } else {
          await collectionService.updateFolder(editing.id, data);
        }
      } else {
        if (onCreate) {
          await onCreate(data);
        } else {
          await collectionService.createCustomFolder(
            data.name,
            data.icon,
            data.isShared,
            data.isR18
          );
        }
      }

      onCreated?.();
      onClose();
    } catch (error) {
      console.error(isEditMode ? 'Failed to update folder:' : 'Failed to create folder:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>{isEditMode ? 'Edit folder' : 'Create Folder'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.text.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Folder Name"
              placeholderTextColor={theme.text.tertiary}
            />

            <Text style={styles.label}>Icon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconScroll}>
              {ICONS.map((i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.iconButton, icon === i ? styles.iconButtonSelected : null]}
                  onPress={() => setIcon(i)}>
                  <Ionicons
                    name={i}
                    size={24}
                    color={icon === i ? readableTextOn(theme.accent) : theme.text.secondary}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.switchRow}>
              <Text style={styles.label}>Share with friends</Text>
              <Switch
                value={isShared}
                onValueChange={setIsShared}
                trackColor={{ false: theme.background.tertiary, true: theme.status.info }}
                thumbColor={theme.text.primary}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.label}>Contains R18 content</Text>
              <Switch
                value={isR18}
                onValueChange={setIsR18}
                trackColor={{ false: theme.background.tertiary, true: theme.status.error }}
                thumbColor={theme.text.primary}
              />
            </View>

            <AnimatedPressable
              style={[styles.createButton, !name.trim() ? styles.createButtonDisabled : undefined]}
              onPress={handleSubmit}
              disabled={!name.trim() || loading}>
              <Text style={styles.createButtonText}>
                {isEditMode ? 'Save changes' : 'Create Folder'}
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: ThemePalette) {
  const accentFg = readableTextOn(theme.accent);
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: theme.background.secondary,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    title: {
      color: theme.text.primary,
      fontSize: 20,
      fontWeight: '700',
    },
    form: {
      gap: 16,
    },
    label: {
      color: theme.text.secondary,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 8,
    },
    input: {
      backgroundColor: theme.background.tertiary,
      borderRadius: 12,
      padding: 16,
      color: theme.text.primary,
      fontSize: 16,
    },
    iconScroll: {
      flexDirection: 'row',
      marginBottom: 16,
    },
    iconButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.background.tertiary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    iconButtonSelected: {
      backgroundColor: theme.accent,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    createButton: {
      backgroundColor: theme.accent,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginTop: 16,
    },
    createButtonDisabled: {
      backgroundColor: theme.background.tertiary,
    },
    createButtonText: {
      color: accentFg,
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
