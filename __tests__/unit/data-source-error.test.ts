import { describe, it, expect } from 'bun:test';
import {
  DataSourceError,
  httpStatusToCode,
  isDataSourceError,
} from '../../libs/services/data-sources/data-source-error';

describe('DataSourceError', () => {
  it('ADS-010 maps HTTP 404 to NOT_FOUND', () => {
    const err = DataSourceError.fromHttpStatus(404, { platform: 'anilist' });
    expect(err).toBeInstanceOf(DataSourceError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.platform).toBe('anilist');
    expect(httpStatusToCode(404)).toBe('NOT_FOUND');
  });

  it('ADS-011 maps HTTP 429 to RATE_LIMITED', () => {
    const err = DataSourceError.fromHttpStatus(429, { platform: 'myanimelist' });
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.platform).toBe('myanimelist');
    expect(httpStatusToCode(429)).toBe('RATE_LIMITED');
  });

  it('ADS-012 maps HTTP 401 (and 403) to UNAUTHORIZED', () => {
    const err401 = DataSourceError.fromHttpStatus(401);
    const err403 = DataSourceError.fromHttpStatus(403);
    expect(err401.code).toBe('UNAUTHORIZED');
    expect(err403.code).toBe('UNAUTHORIZED');
    expect(httpStatusToCode(401)).toBe('UNAUTHORIZED');
    expect(httpStatusToCode(403)).toBe('UNAUTHORIZED');
  });

  it('ADS-013 wraps JSON parse failure as DECODING_ERROR', () => {
    let caught: unknown;
    try {
      JSON.parse('this is not json');
    } catch (e) {
      caught = e;
    }
    const err = DataSourceError.fromDecoding(caught, 'kitsu');
    expect(err.code).toBe('DECODING_ERROR');
    expect(err.platform).toBe('kitsu');
    expect(err.cause).toBe(caught);
    expect(isDataSourceError(err)).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});
