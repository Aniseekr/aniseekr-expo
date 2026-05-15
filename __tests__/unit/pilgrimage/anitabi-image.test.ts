import { describe, expect, it } from 'bun:test';
import {
  normalizeAnitabiImageUrl,
  toFullResImageUrl,
} from '../../../libs/services/pilgrimage/anitabi-image';

describe('toFullResImageUrl', () => {
  it('strips a sole `?plan=h160` query', () => {
    expect(
      toFullResImageUrl('https://image.anitabi.cn/points/207195/abc.jpg?plan=h160')
    ).toBe('https://image.anitabi.cn/points/207195/abc.jpg');
  });

  it('strips `?plan=` regardless of value', () => {
    expect(
      toFullResImageUrl('https://image.anitabi.cn/points/x.jpg?plan=h720')
    ).toBe('https://image.anitabi.cn/points/x.jpg');
  });

  it('preserves other query params when stripping the leading `?plan=`', () => {
    expect(
      toFullResImageUrl('https://image.anitabi.cn/p.jpg?plan=h160&v=2')
    ).toBe('https://image.anitabi.cn/p.jpg?v=2');
  });

  it('strips `&plan=` from the middle of the query', () => {
    expect(
      toFullResImageUrl('https://image.anitabi.cn/p.jpg?v=2&plan=h160&w=1')
    ).toBe('https://image.anitabi.cn/p.jpg?v=2&w=1');
  });

  it('returns the input unchanged when no plan token is present', () => {
    expect(toFullResImageUrl('https://image.anitabi.cn/p.jpg')).toBe(
      'https://image.anitabi.cn/p.jpg'
    );
    expect(toFullResImageUrl('https://image.anitabi.cn/p.jpg?v=2')).toBe(
      'https://image.anitabi.cn/p.jpg?v=2'
    );
  });

  it('handles empty input', () => {
    expect(toFullResImageUrl('')).toBe('');
  });
});

describe('normalizeAnitabiImageUrl', () => {
  it('normalizes runtime /images/bangumi cover paths to the Anitabi image CDN', () => {
    expect(normalizeAnitabiImageUrl('/images/bangumi/10380.jpg', 10380)).toBe(
      'https://image.anitabi.cn/bangumi/10380.jpg?plan=h160'
    );
  });

  it('normalizes root-relative image paths and appends the thumbnail plan', () => {
    expect(normalizeAnitabiImageUrl('/user/0/bangumi/10380/points/a.jpg', 10380)).toBe(
      'https://image.anitabi.cn/user/0/bangumi/10380/points/a.jpg?plan=h160'
    );
  });

  it('uses the bangumi cover fallback when runtime data has an empty cover', () => {
    expect(normalizeAnitabiImageUrl('', 265)).toBe(
      'https://image.anitabi.cn/bangumi/265.jpg?plan=h160'
    );
  });

  it('preserves existing Anitabi plan parameters', () => {
    expect(
      normalizeAnitabiImageUrl('https://image.anitabi.cn/bangumi/240038.jpg?plan=h360', 240038)
    ).toBe('https://image.anitabi.cn/bangumi/240038.jpg?plan=h360');
  });
});
