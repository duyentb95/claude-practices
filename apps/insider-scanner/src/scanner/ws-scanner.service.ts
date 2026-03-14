import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import WebSocket = require('ws');
import { hyperWsUrl } from '../configs';
import { HyperliquidInfoService } from '../frameworks/hyperliquid/hyperliquid-info.service';
import { RawTrade, WsStats } from './dto/trade.dto';

// ─── Reconnection constants ──────────────────────────────────────────────────

/** Initial backoff delay after first disconnect (ms) */
const BACKOFF_INITIAL_MS = 1_000;
/** Maximum backoff delay (ms) */
const BACKOFF_MAX_MS = 30_000;
/** Backoff multiplier per consecutive failure */
const BACKOFF_MULTIPLIER = 2;
/** If no WS message received within this window, consider connection stale (ms) */
const STALE_CONNECTION_MS = 60_000;

@Injectable()
export class WsScannerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WsScannerService.name);
  private socket: WebSocket | null = null;
  private coins: string[] = [];
  private isConnecting = false;
  private disconnectedAt: number | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  readonly stats: WsStats = {
    connected: false,
    reconnects: 0,
    tradesReceived: 0,
    largeTradesFound: 0,
    suspectsFound: 0,
    lastMessageAt: null,
    subscribedCoins: 0,
    queueLength: 0,
    lastReconnectAt: null,
    totalDowntimeMs: 0,
    consecutiveFailures: 0,
  };

  private tradeHandlers: Array<(trade: RawTrade) => void> = [];

  constructor(private readonly infoService: HyperliquidInfoService) {}

  async onModuleInit() {
    await this.loadCoins();
    this.connect();
  }

  onModuleDestroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.terminate();
  }

  /** Register a callback to receive every raw trade */
  onTrade(handler: (trade: RawTrade) => void) {
    this.tradeHandlers.push(handler);
  }

  // ─── Ping keepalive every 20s ──────────────────────────────────────────────

  @Interval(20_000)
  ping() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ method: 'ping' }));
    }
  }

  // ─── Health check every 30s: dead socket + stale connection ────────────────

  @Interval(30_000)
  reconnectIfNeeded() {
    // Case 1: Socket is dead (CLOSED/CLOSING/null)
    if (
      !this.socket ||
      this.socket.readyState === WebSocket.CLOSED ||
      this.socket.readyState === WebSocket.CLOSING
    ) {
      this.logger.warn('WebSocket dead – reconnecting');
      this.scheduleReconnect();
      return;
    }

    // Case 2: Socket is OPEN but no messages received (stale/zombie connection)
    if (
      this.socket.readyState === WebSocket.OPEN &&
      this.stats.lastMessageAt &&
      Date.now() - this.stats.lastMessageAt > STALE_CONNECTION_MS
    ) {
      const staleSec = Math.round(
        (Date.now() - this.stats.lastMessageAt) / 1000,
      );
      this.logger.warn(
        `Stale connection detected – no messages for ${staleSec}s, forcing reconnect`,
      );
      this.forceReconnect();
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async loadCoins() {
    try {
      const metas = await this.infoService.getAllPerpMetas(); // includes HIP-3, excludes delisted
      this.coins = metas.map((m) => m.name).filter(Boolean);
      this.stats.subscribedCoins = this.coins.length;
      this.logger.warn(
        `Loaded ${this.coins.length} coins from Hyperliquid (allPerpMetas, HIP-3 included)`,
      );
    } catch (e) {
      this.logger.error(`Failed to load coins: ${e.message}`);
    }
  }

  /** Calculate backoff delay based on consecutive failures */
  private getBackoffMs(): number {
    const failures = this.stats.consecutiveFailures;
    if (failures <= 0) return BACKOFF_INITIAL_MS;
    const delay = BACKOFF_INITIAL_MS * Math.pow(BACKOFF_MULTIPLIER, failures);
    return Math.min(delay, BACKOFF_MAX_MS);
  }

  /** Schedule a reconnect with exponential backoff (deduped) */
  private scheduleReconnect() {
    if (this.reconnectTimer || this.isConnecting) return;
    const delay = this.getBackoffMs();
    this.logger.log(
      `Scheduling reconnect in ${delay}ms (attempt #${this.stats.consecutiveFailures + 1})`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Force-close current socket and reconnect (for stale connections) */
  private forceReconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.terminate();
      this.socket = null;
    }
    this.stats.connected = false;
    this.trackDisconnect();
    this.scheduleReconnect();
  }

  /** Mark the start of a disconnection period */
  private trackDisconnect() {
    if (!this.disconnectedAt) {
      this.disconnectedAt = Date.now();
    }
  }

  /** Mark reconnection success, accumulate downtime */
  private trackReconnectSuccess() {
    const now = Date.now();
    if (this.disconnectedAt) {
      const downtime = now - this.disconnectedAt;
      this.stats.totalDowntimeMs += downtime;
      this.logger.log(
        `Reconnected after ${Math.round(downtime / 1000)}s downtime (total: ${Math.round(this.stats.totalDowntimeMs / 1000)}s)`,
      );
      this.disconnectedAt = null;
    }
    this.stats.lastReconnectAt = now;
    this.stats.consecutiveFailures = 0;
  }

  private async connect() {
    if (this.isConnecting) return;
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.isConnecting = true;

    // On reconnect, refresh coin list to catch new listings
    if (this.stats.reconnects > 0) {
      this.logger.log('Refreshing coin list before reconnect...');
      await this.loadCoins();
    }

    this.logger.log(`Connecting to ${hyperWsUrl}`);
    this.socket = new WebSocket(hyperWsUrl);

    this.socket.on('open', () => {
      this.stats.connected = true;
      this.isConnecting = false;

      if (this.stats.reconnects > 0) {
        this.trackReconnectSuccess();
      }

      this.logger.log(
        `WS connected – subscribing to ${this.coins.length} trades channels`,
      );

      // Subscribe to HIP-3 trades (dex: 'ALL_DEXS' catches all DEX pairs).
      this.socket!.send(
        JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'trades', dex: 'ALL_DEXS' },
        }),
      );

      // Subscribe to trades for every standard perp coin.
      // Each sub = 1 of 1000 allowed subscriptions per connection.
      for (const coin of this.coins) {
        this.socket!.send(
          JSON.stringify({
            method: 'subscribe',
            subscription: { type: 'trades', coin },
          }),
        );
      }
    });

    this.socket.on('message', (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.channel !== 'trades') return;
        const trades: RawTrade[] = Array.isArray(msg.data)
          ? msg.data
          : [msg.data];

        this.stats.tradesReceived += trades.length;
        this.stats.lastMessageAt = Date.now();

        for (const trade of trades) {
          for (const handler of this.tradeHandlers) {
            handler(trade);
          }
        }
      } catch {
        // malformed message – ignore
      }
    });

    this.socket.on('error', (err) => {
      this.logger.error(`WS error: ${err.message}`);
    });

    this.socket.on('close', (code, reason) => {
      this.stats.connected = false;
      this.stats.reconnects++;
      this.stats.consecutiveFailures++;
      this.isConnecting = false;

      this.trackDisconnect();

      const backoff = this.getBackoffMs();
      this.logger.warn(
        `WS closed (${code}: ${reason.toString() || 'no reason'}) – ` +
          `failures=${this.stats.consecutiveFailures}, retry in ${backoff}ms`,
      );
      this.scheduleReconnect();
    });
  }
}
