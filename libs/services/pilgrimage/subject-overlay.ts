export type SubjectFocus = 'tight' | 'normal' | 'wide';

export interface SubjectOverlayConfig {
  radiusX: number;
  radiusY: number;
  feather: number;
  opacity: number;
}

export const SUBJECT_FOCI: readonly SubjectFocus[] = ['tight', 'normal', 'wide'] as const;

const CONFIG: Record<SubjectFocus, SubjectOverlayConfig> = {
  tight: { radiusX: 0.26, radiusY: 0.42, feather: 0.1, opacity: 0.94 },
  normal: { radiusX: 0.34, radiusY: 0.5, feather: 0.13, opacity: 0.94 },
  wide: { radiusX: 0.43, radiusY: 0.58, feather: 0.16, opacity: 0.94 },
};

const LABEL: Record<SubjectFocus, string> = {
  tight: 'Tight',
  normal: 'Normal',
  wide: 'Wide',
};

export function isSubjectFocus(value: unknown): value is SubjectFocus {
  return value === 'tight' || value === 'normal' || value === 'wide';
}

export function getSubjectOverlayConfig(value: SubjectFocus): SubjectOverlayConfig {
  return CONFIG[isSubjectFocus(value) ? value : 'normal'];
}

export function subjectFocusLabel(value: SubjectFocus): string {
  return LABEL[isSubjectFocus(value) ? value : 'normal'];
}
