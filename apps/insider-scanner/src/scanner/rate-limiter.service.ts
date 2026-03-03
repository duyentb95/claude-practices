import { Injectable } from '@nestjs/common';
import { restRateLimitMs } from '../configs';

/**
 * Simple sequential queue that enforces a minimum delay between tasks.
 * Ensures we stay within Hyperliquid's REST rate limit:
 * - Info endpoints: 20 weight each
 * - Limit: 1200 weight/min → max 60 info calls/min → 1 call/sec
 */
@Injectable()
export class RateLimiterService {
  private queue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  get queueLength(): number {
    return this.queue.length;
  }

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
      if (this.queue.length > 0) {
        await sleep(restRateLimitMs);
      }
    }

    this.isProcessing = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}