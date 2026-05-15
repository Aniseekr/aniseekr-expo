export interface CapturedUriLike {
  uri?: string | null;
  url?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function resolveCapturedUri(result: CapturedUriLike | null | undefined): string | null {
  const uri = typeof result?.uri === 'string' && result.uri.length > 0 ? result.uri : null;
  if (uri) return uri;
  return typeof result?.url === 'string' && result.url.length > 0 ? result.url : null;
}

export function mergeCaptureExif(
  nativeExif: unknown,
  additionalExif: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  const hasNative = isRecord(nativeExif);
  const hasAdditional = isRecord(additionalExif);
  if (!hasNative && !hasAdditional) return null;
  return {
    ...(hasAdditional ? additionalExif : {}),
    ...(hasNative ? nativeExif : {}),
  };
}
