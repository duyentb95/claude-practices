import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseKey } from '../../configs';
import {
  AlertLevel,
  InsiderFlag,
  LargeTrade,
  SuspectEntry,
} from '../../scanner/dto/trade.dto';

// ─── Row types (matching schema.sql) ────────────────────────────────────────

interface SuspectRow {
  address: string;
  total_usd: number;
  trade_count: number;
  coins: string[];
  flags: string[];
  insider_score: number;
  alert_level: string;
  wallet_type: string | null;
  deposit_to_trade_gap_ms: number | null;
  copin_profile: any;
  linked_suspect_address: string | null;
  is_leaderboard_wallet: boolean;
  first_seen_at: string;
  last_seen_at: string;
  profile: any;
  score_components: any;
}

interface LargeTradeRow {
  coin: string;
  side: string;
  price: number;
  size_coin: number;
  usd_size: number;
  fill_count: number;
  hash: string | null;
  trade_time: number;
  taker_address: string | null;
  maker_address: string | null;
  flags: string[];
  detected_at: string;
}

interface EvaluationInsert {
  address: string;
  suspect_id?: number;
  verdict: 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'UNCERTAIN';
  notes?: string;
  evaluated_by?: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient | null = null;

  get enabled(): boolean {
    return this.client !== null;
  }

  onModuleInit() {
    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn(
        'Supabase disabled — SUPABASE_URL and SUPABASE_KEY not set',
      );
      return;
    }

    this.client = createClient(supabaseUrl, supabaseKey);
    this.logger.log('Supabase client initialized');
  }

  // ─── Suspects ─────────────────────────────────────────────────────────────

  /** Upsert a suspect (insert or update if address exists) */
  async upsertSuspect(
    entry: SuspectEntry,
    scoreComponents?: Record<string, number>,
  ): Promise<void> {
    if (!this.client) return;

    const row: SuspectRow = {
      address: entry.address,
      total_usd: entry.totalUsd,
      trade_count: entry.tradeCount,
      coins: [...entry.coins],
      flags: [...entry.flags],
      insider_score: entry.insiderScore,
      alert_level: entry.alertLevel,
      wallet_type: entry.walletType,
      deposit_to_trade_gap_ms: entry.depositToTradeGapMs,
      copin_profile: entry.copinProfile,
      linked_suspect_address: entry.linkedSuspectAddress,
      is_leaderboard_wallet: entry.isLeaderboardWallet,
      first_seen_at: new Date(entry.firstSeenAt).toISOString(),
      last_seen_at: new Date(entry.lastSeenAt).toISOString(),
      profile: entry.profile,
      score_components: scoreComponents ?? null,
    };

    const { error } = await this.client
      .from('suspects')
      .upsert(
        { ...row, updated_at: new Date().toISOString() },
        { onConflict: 'address' },
      );

    if (error) {
      this.logger.warn(`upsertSuspect failed: ${error.message}`);
    }
  }

  /** Load all suspects from DB (for startup recovery) */
  async loadSuspects(): Promise<SuspectEntry[]> {
    if (!this.client) return [];

    const { data, error } = await this.client
      .from('suspects')
      .select('*')
      .order('insider_score', { ascending: false })
      .limit(500);

    if (error) {
      this.logger.warn(`loadSuspects failed: ${error.message}`);
      return [];
    }

    return (data ?? []).map((row: any) => this.rowToSuspect(row));
  }

  private rowToSuspect(row: any): SuspectEntry {
    return {
      address: row.address,
      totalUsd: row.total_usd,
      tradeCount: row.trade_count,
      coins: new Set<string>(row.coins ?? []),
      flags: new Set<InsiderFlag>((row.flags ?? []) as InsiderFlag[]),
      firstSeenAt: new Date(row.first_seen_at).getTime(),
      lastSeenAt: new Date(row.last_seen_at).getTime(),
      profile: row.profile,
      insiderScore: row.insider_score,
      alertLevel: row.alert_level as AlertLevel,
      walletType: row.wallet_type,
      depositToTradeGapMs: row.deposit_to_trade_gap_ms,
      copinProfile: row.copin_profile,
      linkedSuspectAddress: row.linked_suspect_address,
      isLeaderboardWallet: row.is_leaderboard_wallet ?? false,
    };
  }

  // ─── Large Trades ─────────────────────────────────────────────────────────

  /** Insert a large trade record */
  async insertLargeTrade(trade: LargeTrade): Promise<void> {
    if (!this.client) return;

    const row: LargeTradeRow = {
      coin: trade.coin,
      side: trade.side,
      price: trade.price,
      size_coin: trade.sizeCoin,
      usd_size: trade.usdSize,
      fill_count: trade.fillCount,
      hash: trade.hash,
      trade_time: trade.time,
      taker_address: trade.takerAddress,
      maker_address: trade.makerAddress,
      flags: trade.flags as string[],
      detected_at: new Date(trade.detectedAt).toISOString(),
    };

    const { error } = await this.client.from('large_trades').insert(row);

    if (error) {
      this.logger.warn(`insertLargeTrade failed: ${error.message}`);
    }
  }

  /** Load recent large trades (for startup recovery, last 7 days) */
  async loadRecentTrades(limit = 50): Promise<LargeTrade[]> {
    if (!this.client) return [];

    const { data, error } = await this.client
      .from('large_trades')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(limit);

    if (error) {
      this.logger.warn(`loadRecentTrades failed: ${error.message}`);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      coin: row.coin,
      side: row.side,
      price: row.price,
      sizeCoin: row.size_coin,
      usdSize: row.usd_size,
      fillCount: row.fill_count,
      hash: row.hash,
      time: row.trade_time,
      takerAddress: row.taker_address,
      makerAddress: row.maker_address,
      flags: row.flags ?? [],
      detectedAt: new Date(row.detected_at).getTime(),
    }));
  }

  /** Delete large trades older than 7 days */
  async cleanupOldTrades(): Promise<number> {
    if (!this.client) return 0;

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.client
      .from('large_trades')
      .delete()
      .lt('detected_at', cutoff)
      .select('id');

    if (error) {
      this.logger.warn(`cleanupOldTrades failed: ${error.message}`);
      return 0;
    }

    return data?.length ?? 0;
  }

  // ─── Evaluations ──────────────────────────────────────────────────────────

  /** Add a user evaluation for a suspect */
  async addEvaluation(eval_: EvaluationInsert): Promise<boolean> {
    if (!this.client) return false;

    // Look up suspect_id from address if not provided
    let suspectId = eval_.suspect_id;
    if (!suspectId) {
      const { data } = await this.client
        .from('suspects')
        .select('id')
        .eq('address', eval_.address)
        .single();
      suspectId = data?.id;
    }

    const { error } = await this.client.from('evaluations').insert({
      address: eval_.address,
      suspect_id: suspectId ?? null,
      verdict: eval_.verdict,
      notes: eval_.notes ?? null,
      evaluated_by: eval_.evaluated_by ?? 'user',
    });

    if (error) {
      this.logger.warn(`addEvaluation failed: ${error.message}`);
      return false;
    }

    return true;
  }

  /** Get evaluations for an address */
  async getEvaluations(address: string): Promise<any[]> {
    if (!this.client) return [];

    const { data, error } = await this.client
      .from('evaluations')
      .select('*')
      .eq('address', address)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.warn(`getEvaluations failed: ${error.message}`);
      return [];
    }

    return data ?? [];
  }

  // ─── Daily Stats ──────────────────────────────────────────────────────────

  /** Upsert daily aggregated stats */
  async upsertDailyStats(stats: {
    date: string;
    largeTrades: number;
    suspectsFlagged: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    avgScore: number | null;
    topCoins: string[];
  }): Promise<void> {
    if (!this.client) return;

    const { error } = await this.client.from('daily_stats').upsert(
      {
        date: stats.date,
        large_trades: stats.largeTrades,
        suspects_flagged: stats.suspectsFlagged,
        critical_count: stats.criticalCount,
        high_count: stats.highCount,
        medium_count: stats.mediumCount,
        low_count: stats.lowCount,
        avg_score: stats.avgScore,
        top_coins: stats.topCoins,
      },
      { onConflict: 'date' },
    );

    if (error) {
      this.logger.warn(`upsertDailyStats failed: ${error.message}`);
    }
  }
}
