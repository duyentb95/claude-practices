import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { getAddress } from 'ethers';
import { lastValueFrom, catchError, of } from 'rxjs';
import { larkWebhookUrl, larkAlertCooldownMs, leaderboardAlertEnabled, fpDigestEnabled } from '../configs';
import { AlertLevel, InsiderFlag, LargeTrade, SuspectEntry } from './dto/trade.dto';

/** Lark webhook rate limit: 5 req/s. Queue with 300ms gap to stay safe. */
const LARK_SEND_GAP_MS = 300;

const COPIN_BASE = 'https://app.copin.io/trader';

/** Convert hex address to EIP-55 checksum for Copin URLs. */
function toChecksum(addr: string): string {
  try { return getAddress(addr); }
  catch { return addr; }
}

@Injectable()
export class LarkAlertService {
  private readonly logger = new Logger(LarkAlertService.name);

  /** address/key → last alert timestamp, prevents spam */
  private readonly cooldowns = new Map<string, number>();

  /** Sequential send queue to respect Lark's 5 req/s rate limit */
  private sendQueue: Array<() => Promise<void>> = [];
  private isSending = false;

  constructor(private readonly httpService: HttpService) {}

  /**
   * Alert when a confirmed suspect (profile checked) is detected.
   * Skips if same address was alerted within cooldown window.
   */
  async alertSuspect(suspect: SuspectEntry, trigger: LargeTrade): Promise<void> {
    if (!larkWebhookUrl) return;

    const lastAlert = this.cooldowns.get(suspect.address) ?? 0;
    if (Date.now() - lastAlert < larkAlertCooldownMs) return;
    this.cooldowns.set(suspect.address, Date.now());

    this.enqueue(this.buildSuspectCard(suspect, trigger));
  }

  /**
   * Alert immediately when a MEGA trade is detected (before profile lookup).
   */
  async alertMegaTrade(trade: LargeTrade): Promise<void> {
    if (!larkWebhookUrl) return;

    const key = `mega_${trade.hash}`;
    if (this.cooldowns.has(key)) return;
    this.cooldowns.set(key, Date.now());

    this.enqueue(this.buildMegaCard(trade));
  }

  /**
   * Alert when a leaderboard wallet trades a coin outside its known fingerprint.
   * This can indicate a coordinated unusual position by a known top trader.
   */
  async alertLeaderboardUnusualCoin(address: string, trade: LargeTrade, knownCoins: string[]): Promise<void> {
    if (!larkWebhookUrl || !leaderboardAlertEnabled) return;

    const key = `lb_coin_${address}_${trade.coin}`;
    if (this.cooldowns.has(key)) return;
    this.cooldowns.set(key, Date.now());

    const copinUrl = `${COPIN_BASE}/${toChecksum(address)}/hyperliquid`;
    const fillNote = trade.fillCount > 1 ? ` (${trade.fillCount} fills)` : '';

    this.enqueue({
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: { content: '📋 LEADERBOARD WALLET — UNUSUAL COIN', tag: 'plain_text' },
          template: 'yellow',
        },
        elements: [
          {
            tag: 'div',
            text: { tag: 'lark_md', content: `**Wallet**\n\`${address}\`` },
          },
          {
            tag: 'div',
            fields: [
              field('Coin', trade.coin),
              field('Side + Size', `${trade.side} ${fmtUsd(trade.usdSize)}${fillNote} @ ${fmtPrice(trade.price)}`),
            ],
          },
          {
            tag: 'div',
            fields: [
              field('Normal Coins', knownCoins.slice(0, 8).join(', ') || '—'),
              field('Time', utcTime(trade.time)),
            ],
          },
          { tag: 'hr' },
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: { content: '🔗 View on Copin', tag: 'plain_text' },
                type: 'primary',
                url: copinUrl,
              },
            ],
          },
          {
            tag: 'note',
            elements: [
              {
                tag: 'plain_text',
                content: `Hyperliquid Insider Scanner • ${utcTime(Date.now())}`,
              },
            ],
          },
        ],
      },
    });
  }

  /**
   * Daily FP digest: summarises suspects that scored HIGH/CRITICAL but show
   * false-positive indicators (established smart traders, degens, volume-spike days).
   * Sent once per day at configured UTC hour.
   */
  async alertDailyFpDigest(suspects: SuspectEntry[]): Promise<void> {
    if (!larkWebhookUrl || !fpDigestEnabled || suspects.length === 0) return;

    const rows = suspects.map((s) => {
      const archetype = s.copinProfile?.archetype ?? 'UNKNOWN';
      const flags = [...s.flags].map(flagLabel).join(' ');
      const addr = `${s.address.slice(0, 8)}…${s.address.slice(-4)}`;
      return `• \`${addr}\` — ${s.alertLevel} ${s.insiderScore}/100 · ${archetype} · ${flags}`;
    }).join('\n');

    this.enqueue({
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: { content: `🧹 Daily FP Digest — ${suspects.length} potential false positive(s)`, tag: 'plain_text' },
          template: 'grey',
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `Suspects with HIGH/CRITICAL score but FP indicators:\n${rows}`,
            },
          },
          { tag: 'hr' },
          {
            tag: 'note',
            elements: [{ tag: 'plain_text', content: `Hyperliquid Insider Scanner • ${utcTime(Date.now())}` }],
          },
        ],
      },
    });
  }

  // ─── Card builders ────────────────────────────────────────────────────────────

  private buildSuspectCard(suspect: SuspectEntry, trigger: LargeTrade): object {
    const alertLevel = suspect.alertLevel ?? AlertLevel.HIGH;

    const colorMap: Record<AlertLevel, string> = {
      [AlertLevel.CRITICAL]: 'red',
      [AlertLevel.HIGH]:     'orange',
      [AlertLevel.MEDIUM]:   'yellow',
      [AlertLevel.LOW]:      'blue',
      [AlertLevel.NONE]:     'blue',
    };
    const emojiMap: Record<AlertLevel, string> = {
      [AlertLevel.CRITICAL]: '🚨',
      [AlertLevel.HIGH]:     '⚠️',
      [AlertLevel.MEDIUM]:   '📊',
      [AlertLevel.LOW]:      '🔵',
      [AlertLevel.NONE]:     '⚪',
    };

    const headerColor = colorMap[alertLevel];
    const headerTitle = `${emojiMap[alertLevel]} INSIDER ALERT — Score ${suspect.insiderScore ?? 0}/100 [${alertLevel}]`;
    const flags = [...suspect.flags].map(flagLabel).join('  ');
    const fills = suspect.profile == null ? '?' : String(suspect.profile.fillCount90d);
    const acctVal = suspect.profile == null ? '?' : fmtUsd(suspect.profile.accountValue);
    const copinUrl = `${COPIN_BASE}/${toChecksum(suspect.address)}/hyperliquid`;
    const fillNote = trigger.fillCount > 1 ? ` (${trigger.fillCount} fills)` : '';
    const depositGap = suspect.depositToTradeGapMs != null
      ? fmtGap(suspect.depositToTradeGapMs)
      : 'N/A';
    const walletType = suspect.walletType ?? 'UNKNOWN';

    return {
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: { content: headerTitle, tag: 'plain_text' },
          template: headerColor,
        },
        elements: [
          // Wallet (full address)
          {
            tag: 'div',
            text: { tag: 'lark_md', content: `**Wallet**\n\`${suspect.address}\`` },
          },
          // Score + wallet type
          {
            tag: 'div',
            fields: [
              field('Insider Score', `${suspect.insiderScore ?? 0}/100 (${alertLevel})`),
              field('Wallet Type', walletType),
            ],
          },
          // Trade info
          {
            tag: 'div',
            fields: [
              field('Trigger Trade', `${trigger.side} ${fmtUsd(trigger.usdSize)}${fillNote} @ ${fmtPrice(trigger.price)}`),
              field('Coins', [...suspect.coins].join(', ')),
            ],
          },
          {
            tag: 'div',
            fields: [
              field('Total Detected', `${fmtUsd(suspect.totalUsd)} (${suspect.tradeCount} trades)`),
              field('Flags', flags),
            ],
          },
          {
            tag: 'div',
            fields: [
              field('90d Fills', fills),
              field('Account Value', acctVal),
            ],
          },
          {
            tag: 'div',
            fields: [
              field('Deposit → Trade Gap', depositGap),
              field('First Seen', utcTime(suspect.firstSeenAt)),
            ],
          },
          {
            tag: 'div',
            fields: [
              field('Last Seen', utcTime(suspect.lastSeenAt)),
            ],
          },
          // Copin archetype section
          ...(suspect.copinProfile && suspect.copinProfile.archetype !== 'UNKNOWN' ? [
            {
              tag: 'div',
              fields: [
                field('Copin Type', `${archetypeEmoji(suspect.copinProfile.archetype)} ${suspect.copinProfile.archetype}`),
                field('Copin Signals', suspect.copinProfile.signals.join(' · ') || '—'),
              ],
            },
            ...(suspect.copinProfile.d30 ? [{
              tag: 'div',
              fields: [
                field('D30 WinRate', `${suspect.copinProfile.d30.winRate.toFixed(0)}%  /  ${suspect.copinProfile.d30.totalTrade} trades`),
                field('D30 PnL', `$${(suspect.copinProfile.d30.realisedPnl / 1000).toFixed(1)}k  avg hold ${fmtDuration(suspect.copinProfile.d30.avgDuration)}`),
              ],
            }] : []),
          ] : []),
          // Cluster hit section
          ...(suspect.linkedSuspectAddress ? [{
            tag: 'div',
            text: { tag: 'lark_md', content: `**🔗 Cluster Hit**\nFunded by known suspect \`${suspect.linkedSuspectAddress}\`` },
          }] : []),
          { tag: 'hr' },
          // Copin link button
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: { content: '🔗 View on Copin', tag: 'plain_text' },
                type: 'primary',
                url: copinUrl,
              },
            ],
          },
          {
            tag: 'note',
            elements: [
              {
                tag: 'plain_text',
                content: `Hyperliquid Insider Scanner • ${utcTime(Date.now())}`,
              },
            ],
          },
        ],
      },
    };
  }

  private buildMegaCard(trade: LargeTrade): object {
    const copinUrl = trade.takerAddress
      ? `${COPIN_BASE}/${toChecksum(trade.takerAddress)}/hyperliquid`
      : null;
    const fillNote = trade.fillCount > 1 ? ` (${trade.fillCount} fills)` : '';

    return {
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: { content: '⚡ MEGA TRADE DETECTED', tag: 'plain_text' },
          template: 'red',
        },
        elements: [
          // Full taker address
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**Taker**\n${trade.takerAddress ? `\`${trade.takerAddress}\`` : 'unknown'}`,
            },
          },
          {
            tag: 'div',
            fields: [
              field('Coin', trade.coin),
              field('Side', trade.side),
            ],
          },
          {
            tag: 'div',
            fields: [
              field('USD Size', `${fmtUsd(trade.usdSize)}${fillNote}`),
              field('Avg Price', fmtPrice(trade.price)),
            ],
          },
          {
            tag: 'div',
            fields: [
              field('Time', utcTime(trade.time)),
              field('Tx Hash', trade.hash ? `\`${trade.hash.slice(0, 20)}…\`` : '-'),
            ],
          },
          { tag: 'hr' },
          // Copin button (only if we have the address)
          ...(copinUrl
            ? [
                {
                  tag: 'action',
                  actions: [
                    {
                      tag: 'button',
                      text: { content: '🔗 View on Copin', tag: 'plain_text' },
                      type: 'primary',
                      url: copinUrl,
                    },
                  ],
                },
              ]
            : []),
          {
            tag: 'note',
            elements: [
              {
                tag: 'plain_text',
                content: `Hyperliquid Insider Scanner • ${utcTime(Date.now())}`,
              },
            ],
          },
        ],
      },
    };
  }

  // ─── Queue & HTTP ─────────────────────────────────────────────────────────────

  private enqueue(payload: object): void {
    this.sendQueue.push(() => this.doSend(payload));
    this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    if (this.isSending) return;
    this.isSending = true;
    while (this.sendQueue.length > 0) {
      const task = this.sendQueue.shift()!;
      await task();
      if (this.sendQueue.length > 0) {
        await sleep(LARK_SEND_GAP_MS);
      }
    }
    this.isSending = false;
  }

  private async doSend(payload: object): Promise<void> {
    try {
      const res = await lastValueFrom(
        this.httpService
          .post(larkWebhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10_000,
          })
          .pipe(
            catchError((e) => {
              this.logger.error(`Lark webhook error: ${e.message}`);
              return of(null);
            }),
          ),
      );
      if (res?.data?.code && res.data.code !== 0) {
        this.logger.error(`Lark returned code ${res.data.code}: ${res.data.msg}`);
      } else if (res) {
        this.logger.log('Lark alert sent OK');
      }
    } catch (e) {
      this.logger.error(`Lark send failed: ${e.message}`);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function field(label: string, value: string): object {
  return {
    is_short: true,
    text: { tag: 'lark_md', content: `**${label}**\n${value}` },
  };
}

function flagLabel(f: InsiderFlag): string {
  switch (f) {
    case InsiderFlag.MEGA_TRADE:      return '⚡ MEGA';
    case InsiderFlag.FIRST_TIMER:     return '★ FIRST TRADE';
    case InsiderFlag.NEW_ACCOUNT:     return '◆ NEW ACCOUNT';
    case InsiderFlag.LARGE_TRADE:     return 'LARGE';
    case InsiderFlag.FRESH_DEPOSIT:   return '⏱ FRESH DEP';
    case InsiderFlag.DEPOSIT_ONLY:    return '🏦 DEP ONLY';
    case InsiderFlag.GHOST_WALLET:    return '👻 GHOST';
    case InsiderFlag.ONE_SHOT:        return '🎯 ONE SHOT';
    case InsiderFlag.ALL_IN:          return '📈 ALL IN';
    case InsiderFlag.HIGH_LEVERAGE:   return '⚠ HIGH LEV';
    case InsiderFlag.DEAD_MARKET:     return '💀 DEAD MKT';
    case InsiderFlag.HIGH_OI_RATIO:   return '📊 HIGH OI';
    case InsiderFlag.VOLUME_SPIKE:    return '📣 VOL SPIKE';
    case InsiderFlag.NEW_LISTING:     return '🆕 NEW LIST';
    case InsiderFlag.COPIN_SUSPICIOUS: return '🎯 COPIN SUSP';
    case InsiderFlag.SMART_TRADER:    return '🧠 SMART';
    case InsiderFlag.LINKED_SUSPECT:  return '🔗 LINKED';
    case InsiderFlag.LEADERBOARD_COIN: return '📋 LB_COIN';
    default: return f;
  }
}

function fmtGap(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function utcTime(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPrice(n: number): string {
  if (n >= 1_000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(3)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(3)}`;
}

function archetypeEmoji(arch: string): string {
  switch (arch) {
    case 'ALGO_HFT':        return '🤖';
    case 'SMART_TRADER':    return '🧠';
    case 'DEGEN':           return '💀';
    case 'INSIDER_SUSPECT': return '🎯';
    case 'NORMAL':          return '📊';
    default:                return '❓';
  }
}

function fmtDuration(seconds: number): string {
  if (seconds < 3_600)  return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)}h`;
  return `${(seconds / 86_400).toFixed(1)}d`;
}