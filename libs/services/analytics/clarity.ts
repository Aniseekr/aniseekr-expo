import { Platform } from 'react-native';

const CLARITY_PROJECT_ID =
  process.env.EXPO_PUBLIC_CLARITY_PROJECT_ID?.trim() || 'u8mefiww5z';

let initialized = false;

export function initClarity(): void {
  if (initialized) return;
  if (Platform.OS === 'web') return;
  if (!CLARITY_PROJECT_ID) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clarity = require('react-native-clarity') as typeof import('react-native-clarity');
    Clarity.initialize(CLARITY_PROJECT_ID, {
      logLevel: __DEV__ ? Clarity.LogLevel.Warning : Clarity.LogLevel.None,
    });
    initialized = true;
  } catch (error) {
    console.warn('[clarity] init failed', error);
  }
}

export async function pauseClarity(): Promise<void> {
  if (Platform.OS === 'web' || !initialized) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clarity = require('react-native-clarity') as typeof import('react-native-clarity');
    await Clarity.pause();
  } catch {
    // best-effort
  }
}

export async function resumeClarity(): Promise<void> {
  if (Platform.OS === 'web' || !initialized) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clarity = require('react-native-clarity') as typeof import('react-native-clarity');
    await Clarity.resume();
  } catch {
    // best-effort
  }
}
