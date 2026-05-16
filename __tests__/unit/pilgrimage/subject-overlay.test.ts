import { describe, expect, it } from 'bun:test';
import {
  SUBJECT_FOCI,
  getSubjectOverlayConfig,
  isSubjectFocus,
  subjectFocusLabel,
  type SubjectFocus,
} from '../../../libs/services/pilgrimage/subject-overlay';

describe('subject overlay focus', () => {
  it('exposes tight, normal, and wide in UI order', () => {
    expect(SUBJECT_FOCI).toEqual(['tight', 'normal', 'wide']);
  });

  it('labels each focus level for compact camera controls', () => {
    expect(subjectFocusLabel('tight')).toBe('Tight');
    expect(subjectFocusLabel('normal')).toBe('Normal');
    expect(subjectFocusLabel('wide')).toBe('Wide');
  });

  it('widens the subject matte progressively', () => {
    const tight = getSubjectOverlayConfig('tight');
    const normal = getSubjectOverlayConfig('normal');
    const wide = getSubjectOverlayConfig('wide');

    expect(tight.radiusX).toBeLessThan(normal.radiusX);
    expect(normal.radiusX).toBeLessThan(wide.radiusX);
    expect(tight.radiusY).toBeLessThan(normal.radiusY);
    expect(normal.radiusY).toBeLessThan(wide.radiusY);
    expect(wide.feather).toBeGreaterThan(tight.feather);
  });

  it('falls back to normal for unknown persisted values', () => {
    expect(isSubjectFocus('normal')).toBe(true);
    expect(isSubjectFocus('other')).toBe(false);
    expect(getSubjectOverlayConfig('other' as SubjectFocus)).toEqual(
      getSubjectOverlayConfig('normal')
    );
    expect(subjectFocusLabel('other' as SubjectFocus)).toBe('Normal');
  });
});
