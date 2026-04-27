import type { PlatformType } from '../auth/types';

/**
 * Canonical error codes returned by every `AnimeDataSource`. Matches the
 * Swift error taxonomy in `architecture.md` so providers can be swapped
 * without callers branching on raw HTTP status.
 */
export type DataSourceErrorCode =
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'DECODING_ERROR'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'INVALID_ID'
  | 'UNKNOWN';

export interface DataSourceErrorInit {
  code: DataSourceErrorCode;
  message?: string;
  platform?: PlatformType;
  cause?: unknown;
}

/**
 * Domain error thrown by all data sources. Callers branch on `code`:
 *   NOT_FOUND      → may fall back to alternate source
 *   RATE_LIMITED   → rate-limiter handles cooldown automatically
 *   UNAUTHORIZED   → trigger token refresh in auth service
 *   NETWORK_ERROR  → may retry with exponential backoff
 *   other          → propagate to UI
 */
export class DataSourceError extends Error {
  readonly code: DataSourceErrorCode;
  readonly platform?: PlatformType;
  readonly cause?: unknown;

  constructor(init: DataSourceErrorInit) {
    super(init.message ?? init.code);
    this.name = 'DataSourceError';
    this.code = init.code;
    this.platform = init.platform;
    this.cause = init.cause;

    // Restore prototype chain for older TS targets (toolchain may downlevel).
    Object.setPrototypeOf(this, DataSourceError.prototype);
  }

  /**
   * Convert an HTTP status code into a `DataSourceError`. `Retry-After` parsing
   * happens at the call site (the rate limiter consumes it) — this helper just
   * picks the correct enum value.
   */
  static fromHttpStatus(
    status: number,
    init: { platform?: PlatformType; cause?: unknown; message?: string } = {}
  ): DataSourceError {
    const code = httpStatusToCode(status);
    return new DataSourceError({
      code,
      message: init.message ?? `HTTP ${status}`,
      platform: init.platform,
      cause: init.cause,
    });
  }

  /** Wrap an unknown thrown value (typically from `fetch`) as `NETWORK_ERROR`. */
  static fromNetwork(cause: unknown, platform?: PlatformType): DataSourceError {
    return new DataSourceError({
      code: 'NETWORK_ERROR',
      message: cause instanceof Error ? cause.message : 'Network error',
      platform,
      cause,
    });
  }

  /** Wrap a JSON parse failure as `DECODING_ERROR`. */
  static fromDecoding(cause: unknown, platform?: PlatformType): DataSourceError {
    return new DataSourceError({
      code: 'DECODING_ERROR',
      message: cause instanceof Error ? cause.message : 'Failed to decode response',
      platform,
      cause,
    });
  }
}

export function httpStatusToCode(status: number): DataSourceErrorCode {
  if (status === 200 || status === 201 || status === 304) return 'UNKNOWN';
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500 && status <= 599) return 'SERVER_ERROR';
  return 'UNKNOWN';
}

export function isDataSourceError(value: unknown): value is DataSourceError {
  return value instanceof DataSourceError;
}
