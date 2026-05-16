import type { PlatformOSType } from 'react-native';
import type { FocalStop } from '../../../components/pilgrimage/camera/types';
import type { CaptureMode } from './camera-settings';

export interface AndroidCameraExtensions {
  hdr: boolean;
  night: boolean;
  auto: boolean;
}

export interface AndroidCameraCapabilities {
  minZoomRatio: number;
  maxZoomRatio: number;
  zoomRatio: number;
  supportsZoomOut: boolean;
  activeExtensionMode: AndroidCameraExtensionMode;
  extensions: AndroidCameraExtensions;
}

export type AndroidCameraExtensionMode = 'none' | 'hdr';

export type AndroidStopZoomMap = Record<FocalStop, number>;

const DEFAULT_CAPABILITIES: AndroidCameraCapabilities = {
  minZoomRatio: 1,
  maxZoomRatio: 1,
  zoomRatio: 1,
  supportsZoomOut: false,
  activeExtensionMode: 'none',
  extensions: { hdr: false, night: false, auto: false },
};

const ULTRA_WIDE_RATIO = 0.5;
const ULTRA_WIDE_TOLERANCE_MAX = 0.55;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveFiniteNumber(value: unknown, fallback: number): number {
  const n = finiteNumber(value, fallback);
  return n > 0 ? n : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function sanitizeAndroidCameraCapabilities(value: unknown): AndroidCameraCapabilities {
  const raw = asObject(value);
  const rawExtensions = asObject(raw.extensions);
  const minZoomRatio = positiveFiniteNumber(raw.minZoomRatio, DEFAULT_CAPABILITIES.minZoomRatio);
  const rawMaxZoomRatio = positiveFiniteNumber(raw.maxZoomRatio, DEFAULT_CAPABILITIES.maxZoomRatio);
  const maxZoomRatio = Math.max(minZoomRatio, rawMaxZoomRatio);
  const zoomRatio = clamp(
    positiveFiniteNumber(raw.zoomRatio, Math.max(1, minZoomRatio)),
    minZoomRatio,
    maxZoomRatio
  );

  return {
    minZoomRatio,
    maxZoomRatio,
    zoomRatio,
    supportsZoomOut: bool(raw.supportsZoomOut) || minZoomRatio < 1,
    activeExtensionMode: raw.activeExtensionMode === 'hdr' ? 'hdr' : 'none',
    extensions: {
      hdr: bool(rawExtensions.hdr),
      night: bool(rawExtensions.night),
      auto: bool(rawExtensions.auto),
    },
  };
}

export function androidNativeStopsForCapabilities(
  capabilities: AndroidCameraCapabilities | null
): FocalStop[] {
  if (!capabilities) return [1];
  const stops: FocalStop[] = [];
  if (capabilities.minZoomRatio <= ULTRA_WIDE_TOLERANCE_MAX) {
    stops.push(0.5);
  }
  stops.push(1);
  if (capabilities.maxZoomRatio >= 2) stops.push(2);
  if (capabilities.maxZoomRatio >= 3) stops.push(3);
  return stops;
}

export function zoomValueForRatio(
  ratio: number,
  capabilities: AndroidCameraCapabilities | null
): number {
  if (!capabilities) return 0;
  const minRatio = capabilities.minZoomRatio;
  const maxRatio = capabilities.maxZoomRatio;
  if (maxRatio <= minRatio) return 0;

  const clampedRatio = clamp(ratio, minRatio, maxRatio);
  const minLog = Math.log(minRatio);
  const maxLog = Math.log(maxRatio);
  if (maxLog <= minLog) return 0;
  return clamp((Math.log(clampedRatio) - minLog) / (maxLog - minLog), 0, 1);
}

export function zoomRatioForZoomValue(
  zoomValue: number,
  capabilities: AndroidCameraCapabilities | null
): number | undefined {
  if (!capabilities) return undefined;
  const minRatio = capabilities.minZoomRatio;
  const maxRatio = capabilities.maxZoomRatio;
  if (maxRatio <= minRatio) return minRatio;

  const t = clamp(Number.isFinite(zoomValue) ? zoomValue : 0, 0, 1);
  const ratio = Math.exp(Math.log(minRatio) + t * (Math.log(maxRatio) - Math.log(minRatio)));
  return clamp(ratio, minRatio, maxRatio);
}

export function androidStopZoomMap(
  capabilities: AndroidCameraCapabilities | null
): AndroidStopZoomMap {
  const ultraWideRatio =
    capabilities && capabilities.minZoomRatio <= ULTRA_WIDE_TOLERANCE_MAX
      ? Math.max(capabilities.minZoomRatio, ULTRA_WIDE_RATIO)
      : 1;
  return {
    0.5: zoomValueForRatio(ultraWideRatio, capabilities),
    1: zoomValueForRatio(1, capabilities),
    2: zoomValueForRatio(2, capabilities),
    3: zoomValueForRatio(3, capabilities),
  };
}

export function shouldUseAndroidNativeHdr(
  platform: PlatformOSType | string,
  captureMode: CaptureMode,
  capabilities: AndroidCameraCapabilities | null
): boolean {
  return platform === 'android' && captureMode === 'hdr' && capabilities?.extensions.hdr === true;
}

export function androidCameraExtensionModeForCapture(
  platform: PlatformOSType | string,
  captureMode: CaptureMode,
  capabilities: AndroidCameraCapabilities | null
): AndroidCameraExtensionMode {
  return shouldUseAndroidNativeHdr(platform, captureMode, capabilities) ? 'hdr' : 'none';
}
