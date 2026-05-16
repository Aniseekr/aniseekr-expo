export interface PseudoHdrFrame {
  uri: string;
  width: number;
  height: number;
}

const MID_INDEX = 1;

export function choosePseudoHdrFallbackFrame(
  frames: readonly PseudoHdrFrame[]
): PseudoHdrFrame | null {
  if (frames.length === 0) return null;
  return frames[Math.min(MID_INDEX, frames.length - 1)] ?? frames[0] ?? null;
}
