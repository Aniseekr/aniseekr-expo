/**
 * Holds image URLs for a specific platform.
 * Mirrors `PlatformImageData` in iOS aniseeker.
 *
 * Stored as plain strings (not URL objects) to preserve provider-supplied
 * formatting and to keep React Native components free to swallow invalid URLs.
 */
export interface PlatformImageData {
  large?: string;
  extraLarge?: string;
  banner?: string;
}
