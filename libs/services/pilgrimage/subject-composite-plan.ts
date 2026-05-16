export interface SubjectCompositeTransform {
  scale: number;
  translateX: number;
  translateY: number;
  rotationRad: number;
  flipScaleX: -1 | 1;
}

export interface SubjectCompositePlanInput {
  photoWidth: number;
  photoHeight: number;
  previewWidth: number;
  previewHeight: number;
  subjectWidth: number;
  subjectHeight: number;
  opacity: number;
  transform: SubjectCompositeTransform;
}

export interface SubjectCompositePlan {
  srcRect: { x: number; y: number; width: number; height: number };
  dstRect: { x: number; y: number; width: number; height: number };
  centerX: number;
  centerY: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotationDeg: number;
  flipScaleX: -1 | 1;
  opacity: number;
}

export interface SubjectCompositeGateInput {
  mode: string;
  enabled: boolean;
  subjectReady: boolean;
}

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundLayout(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function fitContainRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): { x: number; y: number; width: number; height: number } | null {
  if (
    !validPositive(sourceWidth) ||
    !validPositive(sourceHeight) ||
    !validPositive(targetWidth) ||
    !validPositive(targetHeight)
  ) {
    return null;
  }
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: roundLayout((targetWidth - width) / 2),
    y: roundLayout((targetHeight - height) / 2),
    width: roundLayout(width),
    height: roundLayout(height),
  };
}

export function shouldCompositeSubjectOverlay(input: SubjectCompositeGateInput): boolean {
  return input.mode === 'subject' && input.enabled && input.subjectReady;
}

export function resolveSubjectCompositePlan(
  input: SubjectCompositePlanInput
): SubjectCompositePlan | null {
  const dstRect = fitContainRect(
    input.subjectWidth,
    input.subjectHeight,
    input.photoWidth,
    input.photoHeight
  );
  if (!dstRect || !validPositive(input.previewWidth) || !validPositive(input.previewHeight)) {
    return null;
  }

  const scale = validPositive(input.transform.scale) ? input.transform.scale : 1;
  return {
    srcRect: { x: 0, y: 0, width: input.subjectWidth, height: input.subjectHeight },
    dstRect,
    centerX: input.photoWidth / 2,
    centerY: input.photoHeight / 2,
    translateX: input.transform.translateX * (input.photoWidth / input.previewWidth),
    translateY: input.transform.translateY * (input.photoHeight / input.previewHeight),
    scale,
    rotationDeg: roundLayout((input.transform.rotationRad * 180) / Math.PI),
    flipScaleX: input.transform.flipScaleX,
    opacity: clampUnit(input.opacity),
  };
}
