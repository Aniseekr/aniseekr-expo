import { Image } from 'expo-image';

class ImagePreloaderService {
  private queue: string[] = [];
  private isProcessing = false;
  private maxConcurrent = 2;
  private activeRequestCount = 0;
  private preloadedSet = new Set<string>();

  constructor() {}

  /**
   * Add URLs to the priority queue.
   * New URLs are added to the end.
   */
  preload(urls: string[]) {
    // Filter out already preloaded or queued items to avoid duplicates
    const newUrls = urls.filter(url => !this.preloadedSet.has(url) && !this.queue.includes(url));
    
    if (newUrls.length === 0) return;

    this.queue.push(...newUrls);
    this.processQueue();
  }

  /**
   * Clears the pending queue.
   * Call this when the user changes context (e.g. leaves screen).
   */
  clear() {
    this.queue = [];
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.activeRequestCount < this.maxConcurrent) {
      const url = this.queue.shift();
      if (url) {
        this.activeRequestCount++;
        this.prefetchSingle(url).finally(() => {
          this.activeRequestCount--;
          this.processQueue();
        });
      }
    }

    this.isProcessing = false;
  }

  private async prefetchSingle(url: string) {
    try {
      if (this.preloadedSet.has(url)) return;
      
      await Image.prefetch(url);
      this.preloadedSet.add(url);
      // console.log(`[ImagePreloader] Prefetched: ${url}`);
    } catch (error) {
      console.warn(`[ImagePreloader] Failed to prefetch ${url}`, error);
    }
  }
}

export const ImagePreloader = new ImagePreloaderService();
