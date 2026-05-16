export type EdgeIntensity = 'low' | 'mid' | 'high';

export interface EdgeOverlayConfig {
  threshold: number;
  inkOpacity: number;
  sourceOpacity: number;
}

export const EDGE_INTENSITIES: readonly EdgeIntensity[] = ['low', 'mid', 'high'] as const;

const CONFIG: Record<EdgeIntensity, EdgeOverlayConfig> = {
  low: { threshold: 0.24, inkOpacity: 0.42, sourceOpacity: 0.24 },
  mid: { threshold: 0.14, inkOpacity: 0.52, sourceOpacity: 0 },
  high: { threshold: 0.07, inkOpacity: 0.68, sourceOpacity: 0 },
};

const LABEL: Record<EdgeIntensity, string> = {
  low: 'Edge+',
  mid: 'Edge',
  high: 'Edge Max',
};

export function isEdgeIntensity(value: unknown): value is EdgeIntensity {
  return value === 'low' || value === 'mid' || value === 'high';
}

export function getEdgeOverlayConfig(value: EdgeIntensity): EdgeOverlayConfig {
  return CONFIG[isEdgeIntensity(value) ? value : 'low'];
}

export function edgeIntensityLabel(value: EdgeIntensity): string {
  return LABEL[isEdgeIntensity(value) ? value : 'low'];
}
