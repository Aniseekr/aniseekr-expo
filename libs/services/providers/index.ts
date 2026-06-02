import { malProvider } from './mal-provider';
import { anilistProvider } from './anilist-provider';
import { bangumiProvider } from './bangumi-provider';
import { kitsuProvider } from './kitsu-provider';
import { shikimoriProvider } from './shikimori-provider';
import { simklProvider } from './simkl-provider';
import { annictProvider } from './annict-provider';
import { kavitaProvider } from './kavita-provider';
import { AnimeSourceProvider } from './base-provider';
import { PlatformType } from '../auth/types';

export * from './base-provider';
export * from './mal-provider';
export * from './anilist-provider';
export * from './bangumi-provider';
export * from './kitsu-provider';
export * from './shikimori-provider';
export * from './simkl-provider';
export * from './annict-provider';
export * from './kavita-provider';

const PROVIDERS: Record<PlatformType, AnimeSourceProvider> = {
  myanimelist: malProvider,
  anilist: anilistProvider,
  bangumi: bangumiProvider,
  kitsu: kitsuProvider,
  shikimori: shikimoriProvider,
  simkl: simklProvider,
  annict: annictProvider,
  kavita: kavitaProvider,
};

export function getProvider(platform: PlatformType): AnimeSourceProvider {
  const provider = PROVIDERS[platform];
  if (!provider) {
    throw new Error(`Provider for ${platform} not found`);
  }
  return provider;
}
