// ImageDiskBucket / ImageMemoryBucket — wrappers around expo-image's native
// cache APIs. Neither exposes introspection (the native cache doesn't expose
// counters or sizes), so getStats returns zero — the storage overview at the
// top of the settings screen reflects total cache-dir usage and is the right
// place to look for image cache footprint.

import { Image } from 'expo-image';
import type { CacheBucket, BucketStats } from '../cache-manager';

export class ImageDiskBucket implements CacheBucket {
  readonly id = 'image.disk';
  readonly label = 'Image cache (disk)';
  readonly description = 'Posters, thumbnails, and scene images; redownloaded when needed';
  readonly icon = 'image';

  async getStats(): Promise<BucketStats> {
    // expo-image's disk cache is managed natively (URLCache on iOS, Glide on
    // Android). No public introspection API. The Storage Overview header
    // displays Paths.cache.size, which is dominated by this cache in practice.
    return { entries: 0, bytes: 0 };
  }

  async clear(): Promise<void> {
    await Image.clearDiskCache();
  }
}

export class ImageMemoryBucket implements CacheBucket {
  readonly id = 'image.memory';
  readonly label = 'Image cache (memory)';
  readonly description = 'Decoded images from the current app session';
  readonly icon = 'memory';

  async getStats(): Promise<BucketStats> {
    return { entries: 0, bytes: 0 };
  }

  async clear(): Promise<void> {
    await Image.clearMemoryCache();
  }
}
