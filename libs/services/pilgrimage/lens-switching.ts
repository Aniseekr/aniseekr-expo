export type LensFocalStop = 0.5 | 1 | 2 | 3;
export type TelephotoStop = 2 | 3;

export const LENS_ULTRA_WIDE = 'builtInUltraWideCamera';
export const LENS_WIDE = 'builtInWideAngleCamera';
export const LENS_TELEPHOTO = 'builtInTelephotoCamera';

export function stopForLens(
  lens: string | null | undefined,
  telephotoStop: TelephotoStop = 3
): LensFocalStop | null {
  if (lens === LENS_ULTRA_WIDE) return 0.5;
  if (lens === LENS_WIDE) return 1;
  if (lens === LENS_TELEPHOTO) return telephotoStop;
  return null;
}

export function lensForFocalStop(
  stop: LensFocalStop,
  availableLenses: string[],
  telephotoStop: TelephotoStop = 3
): string | null {
  const lens = lensForStop(stop, telephotoStop);
  if (!lens) return null;
  return availableLenses.includes(lens) ? lens : null;
}

export function stopsForAvailableLenses(
  availableLenses: string[],
  telephotoStop: TelephotoStop = 3
): LensFocalStop[] {
  const stops = new Set<LensFocalStop>();
  for (const lens of availableLenses) {
    const stop = stopForLens(lens, telephotoStop);
    if (stop !== null) stops.add(stop);
  }
  return [...stops].sort((a, b) => a - b);
}

function lensForStop(stop: LensFocalStop, telephotoStop: TelephotoStop): string | null {
  if (stop === 0.5) return LENS_ULTRA_WIDE;
  if (stop === 1) return LENS_WIDE;
  if (stop === telephotoStop) return LENS_TELEPHOTO;
  return null;
}
