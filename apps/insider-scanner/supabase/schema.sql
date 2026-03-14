-- Insider Scanner — Supabase Schema
-- Run this in Supabase SQL Editor to initialize the database.

-- ─── Suspects (all flagged wallets, no cap) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS suspects (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  address       TEXT NOT NULL,
  total_usd     DOUBLE PRECISION NOT NULL DEFAULT 0,
  trade_count   INTEGER NOT NULL DEFAULT 0,
  coins         TEXT[] NOT NULL DEFAULT '{}',
  flags         TEXT[] NOT NULL DEFAULT '{}',
  insider_score INTEGER NOT NULL DEFAULT 0,
  alert_level   TEXT NOT NULL DEFAULT 'NONE',
  wallet_type   TEXT,
  deposit_to_trade_gap_ms BIGINT,
  copin_profile JSONB,
  linked_suspect_address TEXT,
  is_leaderboard_wallet BOOLEAN NOT NULL DEFAULT FALSE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  profile       JSONB,
  score_components JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint on address for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_suspects_address ON suspects (address);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_suspects_alert_level ON suspects (alert_level);
CREATE INDEX IF NOT EXISTS idx_suspects_insider_score ON suspects (insider_score DESC);
CREATE INDEX IF NOT EXISTS idx_suspects_created_at ON suspects (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspects_coins ON suspects USING GIN (coins);

-- ─── Large Trades (7-day rolling window) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS large_trades (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coin           TEXT NOT NULL,
  side           TEXT NOT NULL,
  price          DOUBLE PRECISION NOT NULL,
  size_coin      DOUBLE PRECISION NOT NULL,
  usd_size       DOUBLE PRECISION NOT NULL,
  fill_count     INTEGER NOT NULL DEFAULT 1,
  hash           TEXT,
  trade_time     BIGINT NOT NULL,
  taker_address  TEXT,
  maker_address  TEXT,
  flags          TEXT[] NOT NULL DEFAULT '{}',
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_large_trades_detected_at ON large_trades (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_large_trades_coin ON large_trades (coin);
CREATE INDEX IF NOT EXISTS idx_large_trades_taker ON large_trades (taker_address);

-- ─── Evaluations (user/system verdicts on suspects) ─────────────────────────

CREATE TABLE IF NOT EXISTS evaluations (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  suspect_id  BIGINT REFERENCES suspects(id) ON DELETE SET NULL,
  address     TEXT NOT NULL,
  verdict     TEXT NOT NULL CHECK (verdict IN ('TRUE_POSITIVE', 'FALSE_POSITIVE', 'UNCERTAIN')),
  notes       TEXT,
  evaluated_by TEXT NOT NULL DEFAULT 'user',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_address ON evaluations (address);
CREATE INDEX IF NOT EXISTS idx_evaluations_verdict ON evaluations (verdict);

-- ─── Daily Stats (aggregated metrics) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_stats (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date            DATE NOT NULL UNIQUE,
  large_trades    INTEGER NOT NULL DEFAULT 0,
  suspects_flagged INTEGER NOT NULL DEFAULT 0,
  critical_count  INTEGER NOT NULL DEFAULT 0,
  high_count      INTEGER NOT NULL DEFAULT 0,
  medium_count    INTEGER NOT NULL DEFAULT 0,
  low_count       INTEGER NOT NULL DEFAULT 0,
  avg_score       DOUBLE PRECISION,
  top_coins       TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Cleanup function: delete large_trades older than 7 days ────────────────

CREATE OR REPLACE FUNCTION cleanup_old_trades()
RETURNS void AS $$
BEGIN
  DELETE FROM large_trades WHERE detected_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ─── Useful views for analytics ─────────────────────────────────────────────

-- Accuracy by coin (requires evaluations)
CREATE OR REPLACE VIEW v_accuracy_by_coin AS
SELECT
  unnest(s.coins) AS coin,
  COUNT(DISTINCT s.id) AS flagged,
  COUNT(DISTINCT CASE WHEN e.verdict = 'TRUE_POSITIVE' THEN s.id END) AS confirmed_tp,
  COUNT(DISTINCT CASE WHEN e.verdict = 'FALSE_POSITIVE' THEN s.id END) AS confirmed_fp,
  ROUND(AVG(s.insider_score)::numeric, 1) AS avg_score
FROM suspects s
LEFT JOIN evaluations e ON e.address = s.address
GROUP BY unnest(s.coins)
ORDER BY flagged DESC;

-- Repeat offenders
CREATE OR REPLACE VIEW v_repeat_suspects AS
SELECT
  address,
  COUNT(*) AS times_updated,
  MAX(insider_score) AS max_score,
  MAX(alert_level) AS max_alert,
  coins,
  flags,
  first_seen_at,
  last_seen_at
FROM suspects
WHERE trade_count > 1
ORDER BY insider_score DESC;
