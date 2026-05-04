import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import type { AuthFormKind } from '../../libs/services/auth/auth-errors';
import type { PlatformType } from '../../libs/services/auth/types';

export interface PlatformAuthSheetProps {
  visible: boolean;
  platform: PlatformType | null;
  platformName: string;
  kind: AuthFormKind | null;
  requiresServerUrl?: boolean;
  onClose: () => void;
  onSubmit: (input: PlatformAuthInput) => Promise<void>;
}

export interface PlatformAuthInput {
  username?: string;
  password?: string;
  apiKey?: string;
  serverUrl?: string;
}

export function PlatformAuthSheet({
  visible,
  platform,
  platformName,
  kind,
  requiresServerUrl,
  onClose,
  onSubmit,
}: PlatformAuthSheetProps) {
  const { theme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setUsername('');
      setPassword('');
      setApiKey('');
      setServerUrl('');
    }
  }, [visible]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (kind === 'password') {
      return username.trim().length > 0 && password.length > 0;
    }
    if (kind === 'apikey') {
      if (requiresServerUrl && serverUrl.trim().length === 0) return false;
      return apiKey.trim().length > 0;
    }
    return false;
  }, [submitting, kind, username, password, apiKey, serverUrl, requiresServerUrl]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    hapticsBridge.tap();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        username: username.trim() || undefined,
        password: password || undefined,
        apiKey: apiKey.trim() || undefined,
        serverUrl: serverUrl.trim() || undefined,
      });
      hapticsBridge.success();
    } catch (e) {
      hapticsBridge.error();
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!platform || !kind) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.text.primary }]}>
                  Sign in to {platformName}
                </Text>
                <Text style={[styles.subtitle, { color: theme.text.secondary }]}>
                  {kind === 'password' ? 'Use your platform credentials' : 'Enter your API key'}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={[
                  styles.closeBtn,
                  {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                  },
                ]}>
                <MaterialIcons name="close" size={18} color={theme.text.primary} />
              </Pressable>
            </View>

            {kind === 'password' ? (
              <>
                <FieldLabel label="Username" />
                <Input
                  value={username}
                  onChangeText={setUsername}
                  placeholder="username or email"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <FieldLabel label="Password" />
                <Input
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            ) : null}

            {kind === 'apikey' ? (
              <>
                {requiresServerUrl ? (
                  <>
                    <FieldLabel label="Server URL" />
                    <Input
                      value={serverUrl}
                      onChangeText={setServerUrl}
                      placeholder="https://your-server.com"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                  </>
                ) : null}
                <FieldLabel label="API Key" />
                <Input
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder="paste your API key"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            ) : null}

            {error ? <Text style={[styles.error, { color: '#FF453A' }]}>{error}</Text> : null}

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submit,
                {
                  backgroundColor: canSubmit ? theme.accent : theme.background.tertiary,
                  opacity: pressed && canSubmit ? 0.85 : 1,
                },
              ]}>
              {submitting ? (
                <ActivityIndicator color="#0E0A06" />
              ) : (
                <Text
                  style={[
                    styles.submitLabel,
                    { color: canSubmit ? '#0E0A06' : theme.text.tertiary },
                  ]}>
                  Connect
                </Text>
              )}
            </Pressable>

            <Text style={[styles.footnote, { color: theme.text.tertiary }]}>
              Credentials are stored in your device&apos;s secure enclave and never leave Aniseekr.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function FieldLabel({ label }: { label: string }) {
  const { theme } = useTheme();
  return <Text style={[styles.fieldLabel, { color: theme.text.secondary }]}>{label}</Text>;
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  const { theme } = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.text.tertiary}
      {...props}
      style={[
        styles.input,
        {
          color: theme.text.primary,
          backgroundColor: theme.background.tertiary,
          borderColor: theme.glassBorder,
        },
        props.style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  title: {
    ...Typography.headlineSmall,
  },
  subtitle: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    ...Typography.captionSmall,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.xs,
  },
  input: {
    ...Typography.bodyMedium,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm,
  },
  error: {
    ...Typography.bodySmall,
    marginTop: Spacing.xs,
  },
  submit: {
    marginTop: Spacing.md,
    borderRadius: 16,
    paddingVertical: Spacing.sm + 4,
    alignItems: 'center',
  },
  submitLabel: {
    ...Typography.titleMedium,
    fontWeight: '700',
  },
  footnote: {
    ...Typography.captionSmall,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
