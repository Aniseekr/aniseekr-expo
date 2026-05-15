export interface CameraHeaderInput {
  sceneName?: string | string[] | null;
  animeTitle?: string | string[] | null;
  ep?: string | string[] | number | null;
}

export interface CameraHeaderText {
  title: string;
  subtitle: string;
}

export type CameraOrientationMode = 'auto' | 'landscape';
export type CameraOrientationLockIntent = 'unlock' | 'landscape';

export interface CameraActiveInput {
  appIsForeground: boolean;
  settingsOpen: boolean;
}

export const LANDSCAPE_TOOL_MENU_TRIGGER_SIZE = 44;
export const LANDSCAPE_TOOL_MENU_PANEL_GAP = 12;
export const LANDSCAPE_TOOL_MENU_BOTTOM_OFFSET = 14;
export const LANDSCAPE_TOOL_MENU_MIN_PANEL_WIDTH = 280;
export const LANDSCAPE_TOOL_MENU_PANEL_WIDTH = 300;

const RESERVED_COMPARE_ROUTES = new Set(['align', 'preview', 'share', 'tips']);
const EV_MIN = -2;
const EV_MAX = 2;

export function formatCameraHeader(input: CameraHeaderInput): CameraHeaderText {
  const animeTitle = firstParam(input.animeTitle);
  const episode = formatEpisode(firstParam(input.ep));

  if (animeTitle && episode) {
    return { title: 'Scene Match', subtitle: `${animeTitle} · ${episode}` };
  }
  if (animeTitle) {
    return { title: 'Scene Match', subtitle: `${animeTitle} scene` };
  }
  if (episode) {
    return { title: 'Scene Match', subtitle: `${episode} · anime scene` };
  }
  return { title: 'Scene Match', subtitle: 'Anime reference' };
}

export function isCameraCapturePath(pathname: string | null | undefined): boolean {
  const clean = (pathname ?? '').split(/[?#]/)[0]?.replace(/\/+$/, '') ?? '';
  const parts = clean.split('/').filter(Boolean);
  if (parts.length !== 3) return false;
  if (parts[0] !== 'pilgrimage' || parts[1] !== 'compare') return false;
  return !RESERVED_COMPARE_ROUTES.has(parts[2] ?? '');
}

export function cameraOrientationLockIntent(
  mode: CameraOrientationMode
): CameraOrientationLockIntent {
  return mode === 'landscape' ? 'landscape' : 'unlock';
}

export function roundExposureValue(value: number): number {
  const clamped = Math.max(EV_MIN, Math.min(EV_MAX, value));
  return Number(clamped.toFixed(1));
}

export function resolveCameraActive(input: CameraActiveInput): boolean {
  return input.appIsForeground && !input.settingsOpen;
}

function firstParam(value: CameraHeaderInput['animeTitle'] | CameraHeaderInput['ep']): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

function formatEpisode(value: string): string {
  if (!value) return '';
  const normalized = value.replace(/^ep(?:isode)?\s*/i, '').trim();
  return normalized ? `EP ${normalized}` : '';
}
