import * as dotEnv from 'dotenv';

dotEnv.config();

export const hyperApiUrl =
  process.env.HYPER_API_URL || 'https://api.hyperliquid.xyz';

export const hyperWsUrl =
  process.env.HYPER_WS_URL || 'wss://api.hyperliquid.xyz/ws';

// Minimum USD trade size to flag (default $50k)
export const minTradeUsd = parseFloat(process.env.MIN_TRADE_USD || '100000');

// USD threshold for "mega trade" (always highlighted, default $500k)
export const megaTradeUsd = parseFloat(process.env.MEGA_TRADE_USD || '1000000');

// Fills in the last 90 days below this = "new account" (default 30)
export const newTraderFillsThreshold = parseInt(
  process.env.NEW_TRADER_FILLS_THRESHOLD || '30',
);

// Delay between REST API calls in ms to respect 1200 weight/min limit
// Each info call = 20 weight → max 60/min → 1000ms gap is safe
export const restRateLimitMs = parseInt(
  process.env.REST_RATE_LIMIT_MS || '1100',
);

// How long to cache trader profiles in ms (default 5 min)
export const traderCacheTtlMs = parseInt(
  process.env.TRADER_CACHE_TTL_MS || '300000',
);

// Max large trades to keep in memory for display
export const maxTradeHistory = parseInt(
  process.env.MAX_TRADE_HISTORY || '50',
);

// Max suspect entries to display
export const maxSuspects = parseInt(process.env.MAX_SUSPECTS || '30');

// Terminal refresh interval in ms
export const terminalRefreshMs = parseInt(
  process.env.TERMINAL_REFRESH_MS || '2000',
);

// Max log lines to display in terminal log panel
export const maxLogLines = parseInt(process.env.MAX_LOG_LINES || '8');

// Lark webhook URL for alerts (set LARK_WEBHOOK_URL env or uses default)
export const larkWebhookUrl =
  process.env.LARK_WEBHOOK_URL ||
  'https://open.larksuite.com/open-apis/bot/v2/hook/3d595a75-4042-483d-92a4-64999a30ba86';

// Minimum ms between two alerts for the same address (default 10 min)
export const larkAlertCooldownMs = parseInt(
  process.env.LARK_ALERT_COOLDOWN_MS || '600000',
);

// ─── Copin Analyzer API ────────────────────────────────────────────────────────

// Support both COPIN_API_KEY (new) and X_API_KEY (legacy Railway variable name)
export const copinApiKey   = process.env.COPIN_API_KEY || process.env.X_API_KEY || '';
export const copinApiUrl   = process.env.COPIN_API_URL ?? 'https://api.copin.io';
// Whether Copin integration is active (requires COPIN_API_KEY or X_API_KEY)
export const copinEnabled  = process.env.COPIN_ENABLED !== 'false' && !!copinApiKey;
// Minimum ms between Copin REST calls (30 req/min limit → 2000ms)
export const copinRateLimitMs = parseInt(process.env.COPIN_RATE_LIMIT_MS || '2000');
// How often to refresh algo/smart-trader whitelists (default 6h)
export const copinWhitelistRefreshMs = parseInt(
  process.env.COPIN_WHITELIST_REFRESH_MS || String(6 * 60 * 60 * 1000),
);

// ─── Leaderboard Monitor ───────────────────────────────────────────────────────

// How often to refresh the top-trader leaderboard (default 6h)
export const leaderboardRefreshMs = parseInt(
  process.env.LEADERBOARD_REFRESH_MS || String(6 * 60 * 60 * 1000),
);
// Number of top traders to track in the leaderboard (default 100)
export const leaderboardSize = parseInt(process.env.LEADERBOARD_SIZE || '100');
// Whether to fire Lark alerts when a leaderboard wallet trades an unusual coin
export const leaderboardAlertEnabled = process.env.LEADERBOARD_ALERT_ENABLED !== 'false';

// ─── Supabase (persistent storage) ─────────────────────────────────────────────

export const supabaseUrl = process.env.SUPABASE_URL || '';
export const supabaseKey = process.env.SUPABASE_KEY || ''; // anon/service_role key

// ─── Phase 3: FP Digest ────────────────────────────────────────────────────────

// Whether to send daily FP digest alert (suspects with high FP probability)
export const fpDigestEnabled = process.env.FP_DIGEST_ENABLED !== 'false';
// UTC hour to send the daily FP digest (default 8 = 8:00 AM UTC)
export const fpDigestHour = parseInt(process.env.FP_DIGEST_HOUR || '8');