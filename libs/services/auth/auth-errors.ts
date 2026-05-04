import { PlatformType } from './types';

export type AuthFormKind = 'password' | 'apikey';

export class AuthRequiresFormError extends Error {
  readonly kind: AuthFormKind;
  readonly platform: PlatformType;
  readonly requiresServerUrl: boolean;

  constructor(platform: PlatformType, kind: AuthFormKind, requiresServerUrl = false) {
    super(`Platform ${platform} requires ${kind} form input`);
    this.name = 'AuthRequiresFormError';
    this.kind = kind;
    this.platform = platform;
    this.requiresServerUrl = requiresServerUrl;
  }
}

export function isAuthRequiresFormError(error: unknown): error is AuthRequiresFormError {
  return error instanceof Error && error.name === 'AuthRequiresFormError';
}
