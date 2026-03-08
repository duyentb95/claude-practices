import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CopinInfoService } from '../frameworks/copin/copin-info.service';
import { leaderboardRefreshMs, leaderboardSize } from '../configs';

interface LeaderboardEntry {
  address: string;
  knownCoins: Set<string>;
  rank: number;
}

@Injectable()
export class LeaderboardMonitorService implements OnModuleInit {
  private readonly logger = new Logger(LeaderboardMonitorService.name);

  readonly leaderboard = new Map<string, LeaderboardEntry>();
  lastRefreshedAt: number | null = null;
  private lastPreWarmCount = 0;

  constructor(private readonly copinService: CopinInfoService) {}

  onModuleInit() {
    this.refreshLeaderboard()
      .then(() => {
        // If initial fetch returned nothing (transient API error), retry once after 5 min
        if (!this.lastRefreshedAt) {
          this.logger.log('[Leaderboard] Scheduling retry in 5 min…');
          setTimeout(() => this.refreshLeaderboard().catch(() => null), 5 * 60 * 1000);
        }
      })
      .catch((e) =>
        this.logger.warn(`LeaderboardMonitor init failed: ${(e as Error).message}`),
      );
  }

  @Interval(leaderboardRefreshMs)
  async refreshLeaderboard(): Promise<void> {
    try {
      const addresses = await this.copinService.fetchLeaderboardAddresses(leaderboardSize);
      if (!addresses.length) {
        this.logger.warn('[Leaderboard] No addresses returned — Copin disabled or API error');
        return;
      }

      // Rebuild map, preserving existing knownCoins per address
      const newMap = new Map<string, LeaderboardEntry>();
      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i].toLowerCase();
        const existing = this.leaderboard.get(addr);
        newMap.set(addr, {
          address: addr,
          knownCoins: existing?.knownCoins ?? new Set(),
          rank: i + 1,
        });
      }
      this.leaderboard.clear();
      for (const [k, v] of newMap) this.leaderboard.set(k, v);
      this.lastRefreshedAt = Date.now();
      this.logger.log(`[Leaderboard] Refreshed — ${addresses.length} traders`);

      // Pre-warm Copin classification cache for each address
      // Uses CopinInfoService's built-in 2000ms rate limit
      let preWarmCount = 0;
      for (const addr of addresses) {
        try {
          await this.copinService.getClassification(addr);
          preWarmCount++;
        } catch {
          // ignore individual failures — partial pre-warm is fine
        }
      }
      this.lastPreWarmCount = preWarmCount;
      this.logger.log(`[Leaderboard] Pre-warmed ${preWarmCount} Copin profiles`);
    } catch (e) {
      this.logger.warn(`refreshLeaderboard failed: ${(e as Error).message}`);
    }
  }

  isLeaderboardWallet(address: string): boolean {
    return this.leaderboard.has(address.toLowerCase());
  }

  getKnownCoins(address: string): Set<string> {
    return this.leaderboard.get(address.toLowerCase())?.knownCoins ?? new Set();
  }

  /** Record a coin this leaderboard wallet traded, building its known-coin fingerprint. */
  recordTradedCoin(address: string, coin: string): void {
    const entry = this.leaderboard.get(address.toLowerCase());
    if (entry) entry.knownCoins.add(coin);
  }

  getStats(): { size: number; lastRefreshedAt: number | null; preWarmCount: number } {
    return {
      size: this.leaderboard.size,
      lastRefreshedAt: this.lastRefreshedAt,
      preWarmCount: this.lastPreWarmCount,
    };
  }
}
