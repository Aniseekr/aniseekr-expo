// Derives the zoom-dial's focal-stop set from VisionCamera device info.
//
// On v5 every device reports its real physical lenses (`physicalLensTypes`)
// AND the zoom factors at which a virtual multi-lens device auto-switches
// between them (`zoomLensSwitchFactors`). Both are real values straight from
// the OS — no iOS-only Apple lens-name table, no Android native-patch.
//
// The dial is then driven entirely by `zoomShared` (a real factor): picking a
// pillar is "set zoom to N", and the OS lights up the matching physical lens.
// Per CLAUDE.md Rule 8 the dial only renders pillars the device truly has.
import type {
  CameraDeviceInfo,
  EnginePhysicalLensType,
} from '../../../components/pilgrimage/camera/camera-engine';
import type { FocalStop } from '../../../components/pilgrimage/camera/types';

const LENS_TO_STOP: Record<EnginePhysicalLensType, FocalStop> = {
  'ultra-wide-angle': 0.5,
  'wide-angle': 1,
  // Maps to 3× by default — iPhone 13/14/15/16 Pro telephoto. For older Pro
  // devices (11/12 Pro) where the telephoto is 2× optical, pass `telephotoStop: 2`.
  telephoto: 3,
};

const SWITCH_FACTOR_TOLERANCE = 0.15;

const ALL_STOPS: readonly FocalStop[] = [0.5, 1, 2, 3] as const;

function isFocalStop(value: number): value is FocalStop {
  return value === 0.5 || value === 1 || value === 2 || value === 3;
}

function dedupeSorted(stops: FocalStop[]): FocalStop[] {
  return [...new Set(stops)].sort((a, b) => a - b);
}

/**
 * Returns the focal-stop pillars the dial should render for this device.
 *
 * The priority order is:
 *   1. Physical lenses (`ultra-wide-angle` → 0.5, `wide-angle` → 1, `telephoto` → telephotoStop).
 *   2. Zoom-lens switch factors (when a virtual device auto-switches at e.g.
 *      `[1, 3]` we surface 1× and 3× as snap pillars).
 *   3. The neutral 1× pillar — always present so the dial isn't empty on
 *      single-lens hardware.
 *
 * Stops outside the device's `minZoom..maxZoom` window are filtered out.
 */
export function availableStopsFromDeviceInfo(
  info: CameraDeviceInfo | null,
  telephotoStop: 2 | 3 = 3
): FocalStop[] {
  if (!info) return [1];

  const stops: FocalStop[] = [];
  for (const lens of info.physicalLensTypes) {
    if (lens === 'telephoto') {
      stops.push(telephotoStop);
    } else {
      stops.push(LENS_TO_STOP[lens]);
    }
  }
  for (const factor of info.zoomLensSwitchFactors) {
    // The reported switch factor often lands near a familiar pillar (1, 2, 3) —
    // accept up to ±0.15× off so a device reporting 2.99× telephoto still gets
    // the 3× pillar.
    for (const candidate of ALL_STOPS) {
      if (Math.abs(factor - candidate) <= SWITCH_FACTOR_TOLERANCE) {
        stops.push(candidate);
      }
    }
    if (isFocalStop(factor)) stops.push(factor);
  }
  stops.push(1);

  const filtered = stops.filter((s) => s >= info.minZoom - 0.05 && s <= info.maxZoom + 0.05);
  const deduped = dedupeSorted(filtered);
  return deduped.length > 0 ? deduped : [1];
}

/**
 * Returns true when the device exposes more than one focal-stop pillar — i.e.
 * the user has *some* optical (lens-switching) range, not just digital zoom.
 */
export function hasMultipleLenses(info: CameraDeviceInfo | null): boolean {
  return availableStopsFromDeviceInfo(info).length >= 2;
}
