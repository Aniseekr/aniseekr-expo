// RuntimeFilesBucket — FileSystem-level caches the app downloads at boot:
//
//   1. anitabi-index.runtime.json        (anitabi-data-service.ts)
//   2. anitabi-cross-index.runtime.json  (anitabi-data-service.ts)
//   3. anime-mappings.json               (id-mapping-service.ts) — only the
//      raw download artifact lives on disk; the imported rows live in
//      LocalDB's `id_mappings` table and are NOT touched by this bucket.
//
// Sizes are read directly from Paths.cache so they reflect actual disk usage,
// not metadata estimates.

import { File, Paths } from 'expo-file-system';
import type { CacheBucket, CacheSubBucket, BucketStats } from '../cache-manager';

interface RuntimeFileDescriptor {
  id: string;
  filename: string;
  label: string;
  description?: string;
}

const RUNTIME_FILES: readonly RuntimeFileDescriptor[] = [
  {
    id: 'anitabi-index',
    filename: 'anitabi-index.runtime.json',
    label: 'Anitabi index',
    description: 'Pilgrimage spot list and coverage index',
  },
  {
    id: 'anitabi-cross-index',
    filename: 'anitabi-cross-index.runtime.json',
    label: 'Anitabi cross-index',
    description: 'Cross-platform ID mapping index',
  },
  {
    id: 'id-mappings',
    filename: 'anime-mappings.json',
    label: 'ID mappings download',
    description: 'Raw JSON used by the last import; safe to delete',
  },
];

function sizeOf(filename: string): { exists: boolean; bytes: number } {
  try {
    const file = new File(Paths.cache, filename);
    if (!file.exists) return { exists: false, bytes: 0 };
    return { exists: true, bytes: file.size ?? 0 };
  } catch {
    return { exists: false, bytes: 0 };
  }
}

function deleteIfExists(filename: string): void {
  try {
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn(`[RuntimeFilesBucket] delete ${filename} failed:`, error);
  }
}

export class RuntimeFilesBucket implements CacheBucket {
  readonly id = 'runtime_files';
  readonly label = 'Preloaded files';
  readonly description = 'Pilgrimage indexes and ID mapping downloads; refreshed on next launch';
  readonly icon = 'cloud-download';

  async getStats(): Promise<BucketStats> {
    let entries = 0;
    let bytes = 0;
    for (const f of RUNTIME_FILES) {
      const { exists, bytes: b } = sizeOf(f.filename);
      if (exists) {
        entries += 1;
        bytes += b;
      }
    }
    return { entries, bytes };
  }

  async getChildren(): Promise<CacheSubBucket[]> {
    const children: CacheSubBucket[] = [];
    for (const f of RUNTIME_FILES) {
      const { exists, bytes } = sizeOf(f.filename);
      if (!exists) continue;
      children.push({
        id: `runtime_files.${f.id}`,
        label: f.label,
        description: f.description,
        stats: { entries: 1, bytes },
        clear: async () => {
          deleteIfExists(f.filename);
        },
      });
    }
    return children;
  }

  async clear(): Promise<void> {
    for (const f of RUNTIME_FILES) {
      deleteIfExists(f.filename);
    }
  }
}
