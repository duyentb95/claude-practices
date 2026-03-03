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

@Injectable()
export class WsScannerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WsScannerService.name);
  private socket: WebSocket | null = null;
  private coins: string[] = [];
  private isConnecting = false;

  readonly stats: WsStats = {
    connected: false,
    reconnects: 0,
    tradesReceived: 0,
    largeTradesFound: 0,
    suspectsFound: 0,
    lastMessageAt: null,
    subscribedCoins: 0,
    queueLength: 0,
  };

  private tradeHandlers: Array<(trade: RawTrade) => void> = [];

  constructor(private readonly infoService: HyperliquidInfoService) {}

  async onModuleInit() {
    await this.loadCoins();
    this.connect();
  }

  onModuleDestroy() {
    this.socket?.terminate();
  }

  /** Register a callback to receive every raw trade */
  onTrade(handler: (trade: RawTrade) => void) {
    this.tradeHandlers.push(handler);
  }

  // ─── Ping keepalive every 20s ────────────────────────────────────────────────

  @Interval(20_000)
  ping() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ method: 'ping' }));
    }
  }

  // ─── Reconnect check every 30s ───────────────────────────────────────────────

  @Interval(30_000)
  reconnectIfNeeded() {
    if (
      !this.socket ||
      this.socket.readyState === WebSocket.CLOSED ||
      this.socket.readyState === WebSocket.CLOSING
    ) {
      this.logger.warn('WebSocket dead – reconnecting');
      this.connect();
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async loadCoins() {
    try {
      const [metas] = await this.infoService.getMetaAndAssetCtxs();
      this.coins = metas.map((m) => m.name).filter(Boolean);
      this.stats.subscribedCoins = this.coins.length;
      this.logger.log(`Loaded ${this.coins.length} coins from Hyperliquid`);
    } catch (e) {
      this.logger.error(`Failed to load coins: ${e.message}`);
    }
  }

  private connect() {
    if (this.isConnecting) return;
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.isConnecting = true;

    this.logger.log(`Connecting to ${hyperWsUrl}`);
    this.socket = new WebSocket(hyperWsUrl);

    this.socket.on('open', () => {
      this.stats.connected = true;
      this.isConnecting = false;
      this.logger.log(
        `WS connected – subscribing to ${this.coins.length} trades channels`,
      );

      // Subscribe to trades for every perp coin.
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
      this.isConnecting = false;
      this.logger.warn(
        `WS closed (${code}: ${reason.toString() || 'no reason'}) – retry in 5s`,
      );
      setTimeout(() => this.connect(), 5_000);
    });
  }
}