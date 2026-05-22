// JS surface for the native iOS CloudKit bridge.
//
// On Android (or any build without the native module), every method short-
// circuits to a "not available" response so callers can probe at runtime
// without crashing.
//
// The native counterpart lives in `plugins/templates/AniseekrCloudKitBridge.swift`
// and is installed into the Xcode project by `plugins/with-cloudkit-bridge.js`
// during `expo prebuild`.

import { NativeModules, Platform } from 'react-native';

import type { CloudKitRecord } from '../../libs/services/backup/cloudkit-converter';

interface NativeCloudKitBridge {
  isAvailable(): Promise<boolean>;
  fetchAllRecords(): Promise<CloudKitRecord[]>;
  writeRecords(records: CloudKitRecord[]): Promise<{ written: number; failed: number }>;
  deleteAllRecords(): Promise<{ deleted: number }>;
}

const Native = (NativeModules as Record<string, unknown>).AniseekrCloudKitBridge as
  | NativeCloudKitBridge
  | undefined;

export type CloudKitAvailability = 'unavailable' | 'no-account' | 'ready';

export interface CloudKitBridgeLike {
  isInstalled(): boolean;
  getAvailability(): Promise<CloudKitAvailability>;
  fetchAllRecords(): Promise<CloudKitRecord[]>;
  writeRecords(records: CloudKitRecord[]): Promise<{ written: number; failed: number }>;
  deleteAllRecords(): Promise<{ deleted: number }>;
}

export const cloudKitBridge: CloudKitBridgeLike = {
  isInstalled() {
    return Platform.OS === 'ios' && !!Native;
  },

  async getAvailability() {
    if (Platform.OS !== 'ios') return 'unavailable';
    if (!Native) return 'unavailable';
    try {
      const ok = await Native.isAvailable();
      return ok ? 'ready' : 'no-account';
    } catch {
      return 'unavailable';
    }
  },

  async fetchAllRecords() {
    if (!Native) throw new Error('CloudKit bridge is not installed on this platform/build');
    return Native.fetchAllRecords();
  },

  async writeRecords(records) {
    if (!Native) throw new Error('CloudKit bridge is not installed on this platform/build');
    return Native.writeRecords(records);
  },

  async deleteAllRecords() {
    if (!Native) throw new Error('CloudKit bridge is not installed on this platform/build');
    return Native.deleteAllRecords();
  },
};
