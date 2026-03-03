import { Injectable, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InsiderDetectorService } from '../scanner/insider-detector.service';
import { WsScannerService } from '../scanner/ws-scanner.service';
import { AlertLevel, InsiderFlag, LargeTrade, SuspectEntry } from '../scanner/dto/trade.dto';
import { maxLogLines, maxTradeHistory, terminalRefreshMs } from '../configs';

// ─── ANSI helpers ──────────────────────────────────────────────────────────────

const R = '\x1b[0m';          // reset
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const FG = {
  red: '\x1b[91m',
  green: '\x1b[92m',
  yellow: '\x1b[93m',
  blue: '\x1b[94m',
  magenta: '\x1b[95m',
  cyan: '\x1b[96m',
  white: '\x1b[97m',
  gray: '\x1b[90m',
};

const BG = {
  red: '\x1b[41m',
  green: '\x1b[42m',
  yellow: '\x1b[43m',
  blue: '\x1b[44m',
  black: '\x1b[40m',
};

function c(color: string, text: string): string {
  return `${color}${text}${R}`;
}
function bold(text: string): string {
  return `${BOLD}${text}${R}`;
}

// Full ETH address (42 chars) + columns → use 160 by default
const TERM_WIDTH = parseInt(process.env.TERM_WIDTH || '160');

function hr(char = '─'): string {
  return FG.gray + char.repeat(TERM_WIDTH) + R;
}

function padEnd(s: string, len: number): string {
  const visible = stripAnsi(s);
  const pad = Math.max(0, len - visible.length);
  return s + ' '.repeat(pad);
}

function padStart(s: string, len: number): string {
  const visible = stripAnsi(s);
  const pad = Math.max(0, len - visible.length);
  return ' '.repeat(pad) + s;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8);
}


function colorFlags(flags: Set<InsiderFlag> | InsiderFlag[]): string {
  const arr = flags instanceof Set ? [...flags] : flags;
  return arr
    .map((f) => {
      switch (f) {
        case InsiderFlag.MEGA_TRADE:    return c(FG.red + BOLD, '⚡MEGA');
        case InsiderFlag.FIRST_TIMER:   return c(FG.magenta + BOLD, '★FIRST');
        case InsiderFlag.NEW_ACCOUNT:   return c(FG.yellow, '◆NEW');
        case InsiderFlag.LARGE_TRADE:   return c(FG.cyan, 'LARGE');
        case InsiderFlag.FRESH_DEPOSIT: return c(FG.cyan + BOLD, '⏱FRESH');
        case InsiderFlag.DEPOSIT_ONLY:  return c(FG.blue, '🏦DEP_ONLY');
        case InsiderFlag.GHOST_WALLET:  return c(FG.magenta, '👻GHOST');
        case InsiderFlag.ONE_SHOT:      return c(FG.magenta + BOLD, '🎯ONE_SHOT');
        case InsiderFlag.ALL_IN:        return c(FG.red, 'ALL_IN');
        case InsiderFlag.HIGH_LEVERAGE: return c(FG.yellow, 'HIGH_LEV');
        case InsiderFlag.DEAD_MARKET:   return c(FG.gray, 'DEAD_MKT');
        case InsiderFlag.HIGH_OI_RATIO: return c(FG.yellow, 'HIGH_OI');
        default:                        return f;
      }
    })
    .join(' ');
}

function colorSide(side: string): string {
  return side === 'BUY' ? c(FG.green, 'BUY ') : c(FG.red, 'SELL');
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class TerminalService implements OnModuleInit {
  private startedAt = Date.now();

  constructor(
    private readonly detector: InsiderDetectorService,
    private readonly scanner: WsScannerService,
  ) {}

  onModuleInit() {
    // Hide cursor for cleaner display
    process.stdout.write('\x1b[?25l');
    process.on('exit', () => process.stdout.write('\x1b[?25h'));
  }

  @Interval(terminalRefreshMs)
  render() {
    const out: string[] = [];
    out.push(...this.renderHeader());
    out.push(...this.renderTrades());
    out.push(...this.renderSuspects());
    out.push(...this.renderLogs());
    out.push(...this.renderStats());

    // Clear screen, move to top-left, print
    process.stdout.write('\x1b[2J\x1b[H' + out.join('\n') + '\n');
  }

  // ─── Sections ────────────────────────────────────────────────────────────────

  private renderHeader(): string[] {
    const wsStatus = this.scanner.stats.connected
      ? c(FG.green, '● CONNECTED')
      : c(FG.red, '● DISCONNECTED');

    const uptime = fmtUptime(Date.now() - this.startedAt);
    const now = new Date().toTimeString().slice(0, 8);

    const title = bold(c(FG.cyan, '  HYPERLIQUID INSIDER SCANNER'));
    const right = `${wsStatus}  ${c(FG.gray, now)}  ${c(FG.gray, 'up ' + uptime)}  `;

    const titleVis = stripAnsi(title);
    const rightVis = stripAnsi(right);
    const gap = Math.max(1, TERM_WIDTH - titleVis.length - rightVis.length);
    const line = title + ' '.repeat(gap) + right;

    return [
      hr('═'),
      line,
      hr('═'),
    ];
  }

  private renderTrades(): string[] {
    const lines: string[] = [];
    const trades = this.detector.largeTrades.slice(0, 20);
    const threshold = `>${fmtUsd(parseInt(process.env.MIN_TRADE_USD || '50000'))}`;

    lines.push(
      bold(c(FG.white, ` LARGE TRADES (${threshold}) — last ${trades.length}/${maxTradeHistory}`)),
    );

    // Header row
    const hdr = [
      padEnd(c(FG.gray, 'TIME    '), 8),
      padEnd(c(FG.gray, 'COIN  '), 7),
      padEnd(c(FG.gray, 'SIDE'), 4),
      padStart(c(FG.gray, 'USD SIZE'), 10),
      padStart(c(FG.gray, 'PRICE'), 12),
      padStart(c(FG.gray, 'FILLS'), 5),
      padEnd(c(FG.gray, 'TAKER'), 42),
      c(FG.gray, 'FLAGS'),
    ].join('  ');
    lines.push(DIM + hdr + R);
    lines.push(hr());

    if (trades.length === 0) {
      lines.push(c(FG.gray, '  Waiting for trades…'));
    }

    for (const t of trades) {
      lines.push(this.renderTradeRow(t));
    }

    lines.push('');
    return lines;
  }

  private renderTradeRow(t: LargeTrade): string {
    const isMega = t.flags.includes(InsiderFlag.MEGA_TRADE);
    const isNew =
      t.flags.includes(InsiderFlag.NEW_ACCOUNT) ||
      t.flags.includes(InsiderFlag.FIRST_TIMER);

    const usdCol = isMega
      ? bold(c(FG.red, padStart(fmtUsd(t.usdSize), 10)))
      : isNew
        ? bold(c(FG.yellow, padStart(fmtUsd(t.usdSize), 10)))
        : padStart(c(FG.white, fmtUsd(t.usdSize)), 10);

    const coinCol = padEnd(
      isMega ? bold(c(FG.cyan, t.coin)) : c(FG.cyan, t.coin),
      7,
    );

    // fillCount: show "Nf" when aggregated from multiple fills
    const fillsCol = padStart(
      t.fillCount > 1
        ? c(FG.yellow, `${t.fillCount}f`)
        : c(FG.gray, '1f'),
      5,
    );

    const takerCol = padEnd(
      t.takerAddress
        ? c(FG.blue, t.takerAddress)
        : c(FG.gray, 'unknown'),
      42,
    );

    return [
      padEnd(c(FG.gray, fmtTime(t.time)), 8),
      '  ',
      coinCol,
      colorSide(t.side),
      '  ',
      usdCol,
      '  ',
      padStart(c(FG.gray, fmtPrice(t.price)), 12),
      fillsCol,
      '  ',
      takerCol,
      '  ',
      colorFlags(t.flags),
    ].join('');
  }

  private renderSuspects(): string[] {
    const lines: string[] = [];
    const suspects = this.detector.getSuspectsSorted();

    lines.push(
      bold(
        c(FG.white, ` SUSPICIOUS WALLETS (${suspects.length}) — sorted by risk score`),
      ),
    );

    const hdr = [
      padEnd(c(FG.gray, 'WALLET'), 42),
      padStart(c(FG.gray, 'SCORE'), 6),
      padStart(c(FG.gray, 'TOTAL USD'), 10),
      padStart(c(FG.gray, 'TRD'), 4),
      padStart(c(FG.gray, 'ACCT VAL'), 9),
      padStart(c(FG.gray, '90d FILLS'), 9),
      padEnd(c(FG.gray, 'COINS'), 22),
      c(FG.gray, 'FLAGS'),
    ].join('  ');
    lines.push(DIM + hdr + R);
    lines.push(hr());

    if (suspects.length === 0) {
      lines.push(c(FG.gray, '  No suspects detected yet…'));
    }

    for (const s of suspects) {
      lines.push(this.renderSuspectRow(s));
    }

    lines.push('');
    return lines;
  }

  private renderSuspectRow(s: SuspectEntry): string {
    const level = s.alertLevel ?? AlertLevel.LOW;
    const walletColor =
      level === AlertLevel.CRITICAL ? FG.red :
      level === AlertLevel.HIGH     ? FG.yellow :
      level === AlertLevel.MEDIUM   ? FG.cyan :
                                      FG.blue;

    const score = s.insiderScore ?? 0;
    const scoreColor =
      score >= 75 ? FG.red :
      score >= 55 ? FG.yellow :
      score >= 40 ? FG.cyan :
                    FG.gray;
    const scoreDisplay = padStart(bold(c(scoreColor, String(score))), 6);

    const coins = [...s.coins].join(',');
    const coinsDisplay = coins.length > 20 ? coins.slice(0, 19) + '…' : coins;

    const fillsDisplay =
      s.profile == null
        ? c(FG.gray, '?')
        : s.profile.fillCount90d === 0
          ? bold(c(FG.magenta, '0'))
          : s.profile.fillCount90d < parseInt(process.env.NEW_TRADER_FILLS_THRESHOLD || '30')
            ? c(FG.yellow, String(s.profile.fillCount90d))
            : c(FG.gray, String(s.profile.fillCount90d));

    const acctVal =
      s.profile == null
        ? c(FG.gray, '?')
        : c(FG.white, fmtUsd(s.profile.accountValue));

    return [
      padEnd(c(walletColor, s.address), 42),
      '  ',
      scoreDisplay,
      '  ',
      padStart(bold(c(FG.white, fmtUsd(s.totalUsd))), 10),
      '  ',
      padStart(c(FG.gray, String(s.tradeCount)), 4),
      '  ',
      padStart(acctVal, 9),
      '  ',
      padStart(fillsDisplay, 9),
      '  ',
      padEnd(c(FG.gray, coinsDisplay), 22),
      '  ',
      colorFlags(s.flags),
    ].join('');
  }

  private renderLogs(): string[] {
    const lines: string[] = [];
    lines.push(bold(c(FG.white, ' ACTIVITY LOG')));
    lines.push(hr());

    const recent = this.detector.logs.slice(0, maxLogLines);
    if (recent.length === 0) {
      lines.push(c(FG.gray, '  Waiting…'));
    } else {
      for (const log of recent) {
        const isAlert = log.includes('SUSPECT');
        lines.push(
          isAlert
            ? c(FG.yellow, '  ' + log)
            : c(FG.gray, '  ' + log),
        );
      }
    }

    lines.push('');
    return lines;
  }

  private renderStats(): string[] {
    const s = this.scanner.stats;
    const parts = [
      `${c(FG.gray, 'Pairs:')} ${c(FG.white, String(s.subscribedCoins))}`,
      `${c(FG.gray, 'Trades recv:')} ${c(FG.white, formatNumber(s.tradesReceived))}`,
      `${c(FG.gray, 'Large:')} ${c(FG.yellow, String(s.largeTradesFound))}`,
      `${c(FG.gray, 'Suspects:')} ${c(FG.red, String(s.suspectsFound))}`,
      `${c(FG.gray, 'Queue:')} ${c(s.queueLength > 5 ? FG.yellow : FG.gray, String(s.queueLength))}`,
      `${c(FG.gray, 'Reconnects:')} ${c(FG.gray, String(s.reconnects))}`,
      s.lastMessageAt
        ? `${c(FG.gray, 'Last msg:')} ${c(FG.gray, fmtTime(s.lastMessageAt))}`
        : c(FG.gray, 'No messages yet'),
    ];

    return [hr('═'), ' ' + parts.join('   '), hr('═')];
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtPrice(n: number): string {
  if (n >= 1_000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(3)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(3)}`;
}

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}