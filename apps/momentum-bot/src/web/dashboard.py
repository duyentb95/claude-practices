"""
Embedded HTML dashboard for the Momentum Trading Bot.
Follows the Copin Design System (dark terminal aesthetic).

Exports a single constant: DASHBOARD_HTML
"""

DASHBOARD_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Momentum Bot Dashboard</title>
<style>
/* ===== RESET ===== */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

/* ===== COPIN COLOR SYSTEM ===== */
:root {
  --bg-page:      #0B0E18;
  --bg-card:      #101423;
  --bg-hover:     #1F2232;
  --border:       #313856;
  --text-primary: #FCFCFD;
  --text-secondary:#C0C0C9;
  --text-muted:   #777E90;
  --accent:       #4EAEFD;
  --profit:       #38D060;
  --loss:         #FA5547;
  --warning:      #FFC24B;
  --font-mono:    'SF Mono', Menlo, Monaco, 'Courier New', monospace;
}

/* ===== BASE ===== */
html,body {
  height:100%; background:var(--bg-page); color:var(--text-primary);
  font-family:var(--font-mono); font-size:13px; line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
a { color:var(--accent); text-decoration:none; }
a:hover { text-decoration:underline; }

/* ===== SCROLLBAR ===== */
::-webkit-scrollbar { width:6px; height:6px; }
::-webkit-scrollbar-track { background:var(--bg-page); }
::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }
::-webkit-scrollbar-thumb:hover { background:var(--text-muted); }

/* ===== HEADER ===== */
.header {
  position:sticky; top:0; z-index:100;
  display:flex; align-items:center; gap:16px;
  padding:12px 24px;
  background:var(--bg-card); border-bottom:1px solid var(--border);
  flex-wrap:wrap;
}
.logo {
  font-size:16px; font-weight:700; color:var(--accent);
  white-space:nowrap; margin-right:8px;
}
.header-badges { display:flex; gap:8px; align-items:center; margin-right:auto; }
.status-dot {
  width:8px; height:8px; border-radius:50%; display:inline-block;
  margin-right:4px; vertical-align:middle;
}
.status-dot.running { background:var(--profit); box-shadow:0 0 6px var(--profit); }
.status-dot.stopped { background:var(--loss); box-shadow:0 0 6px var(--loss); }
.header-stats {
  display:flex; gap:20px; align-items:center; flex-wrap:wrap;
}
.header-stat { white-space:nowrap; }
.header-stat .hs-label { color:var(--text-muted); font-size:10px; text-transform:uppercase; letter-spacing:0.5px; }
.header-stat .hs-value { color:var(--text-primary); font-size:14px; font-weight:600; }
.btn-emergency {
  background:var(--loss); color:#fff; border:none; padding:6px 14px;
  border-radius:4px; font-family:var(--font-mono); font-size:12px;
  font-weight:700; cursor:pointer; white-space:nowrap;
  transition:opacity .15s;
}
.btn-emergency:hover { opacity:0.85; }

/* ===== BADGES ===== */
.badge {
  display:inline-block; padding:2px 8px; border-radius:4px;
  font-size:11px; font-weight:600; white-space:nowrap;
}
.badge-long  { background:rgba(56,208,96,0.10);  color:var(--profit); }
.badge-short { background:rgba(250,85,71,0.10);  color:var(--loss); }
.badge-dry   { background:rgba(255,194,75,0.10); color:var(--warning); }
.badge-test  { background:rgba(78,174,253,0.10); color:var(--accent); }
.badge-status{ font-size:12px; }
.badge-filled  { background:rgba(56,208,96,0.10);  color:var(--profit); }
.badge-skipped { background:rgba(119,126,144,0.15); color:var(--text-muted); }
.badge-pending { background:rgba(255,194,75,0.10);  color:var(--warning); }
.badge-canceled{ background:rgba(250,85,71,0.10);   color:var(--loss); }

/* ===== TABS ===== */
.tab-bar {
  display:flex; gap:0; padding:0 24px;
  background:var(--bg-card); border-bottom:1px solid var(--border);
}
.tab-btn {
  padding:12px 20px; font-family:var(--font-mono); font-size:12px;
  font-weight:600; color:var(--text-muted); background:none; border:none;
  border-bottom:2px solid transparent; cursor:pointer;
  transition:color .15s, border-color .15s;
  text-transform:uppercase; letter-spacing:0.5px;
}
.tab-btn:hover { color:var(--text-secondary); }
.tab-btn.active { color:var(--accent); border-bottom-color:var(--accent); }

/* ===== CONTENT ===== */
.content { padding:20px 24px; max-width:1600px; margin:0 auto; }
.tab-panel { display:none; }
.tab-panel.active { display:block; }

/* ===== STAT CARDS ===== */
.stats-row {
  display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
  gap:12px; margin-bottom:20px;
}
.stat-card {
  background:var(--bg-card); border:1px solid var(--border); border-radius:8px;
  padding:16px 20px;
}
.stat-card .label {
  color:var(--text-muted); font-size:10px; text-transform:uppercase;
  letter-spacing:0.5px;
}
.stat-card .value {
  font-size:20px; font-weight:700; color:var(--text-primary); margin-top:4px;
}

/* ===== TABLES ===== */
.table-wrap {
  background:var(--bg-card); border:1px solid var(--border); border-radius:8px;
  overflow:auto; margin-bottom:20px;
}
.table-title {
  padding:14px 16px 10px; font-size:13px; font-weight:700;
  color:var(--text-primary); border-bottom:1px solid var(--border);
}
table { width:100%; border-collapse:collapse; }
th {
  color:var(--text-muted); font-size:11px; text-transform:uppercase;
  letter-spacing:0.5px; padding:10px 16px; border-bottom:1px solid var(--border);
  text-align:left; position:sticky; top:0; background:var(--bg-card);
  white-space:nowrap;
}
td {
  padding:10px 16px; border-bottom:1px solid rgba(49,56,86,0.5);
  white-space:nowrap; font-size:12px;
}
tr:hover td { background:var(--bg-hover); }
.text-right { text-align:right; }
.text-center { text-align:center; }
.pnl-pos { color:var(--profit); }
.pnl-neg { color:var(--loss); }
.text-muted { color:var(--text-muted); }
.text-secondary { color:var(--text-secondary); }

/* ===== SIGNALS LIST ===== */
.signals-list { display:flex; flex-direction:column; gap:0; }
.signal-row {
  display:grid;
  grid-template-columns: 100px 70px 70px 50px 90px 90px 90px 60px 80px;
  gap:8px; padding:10px 16px; align-items:center;
  border-bottom:1px solid rgba(49,56,86,0.5);
  font-size:12px;
}
.signal-row:hover { background:var(--bg-hover); }
.signal-header {
  color:var(--text-muted); font-size:11px; text-transform:uppercase;
  letter-spacing:0.5px; font-weight:600;
  border-bottom:1px solid var(--border);
}
.signal-header:hover { background:transparent; }

/* ===== CONFIG FORM ===== */
.config-grid {
  display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr));
  gap:16px;
}
.config-section {
  background:var(--bg-card); border:1px solid var(--border); border-radius:8px;
  padding:16px 20px;
}
.config-section h3 {
  font-size:12px; font-weight:700; color:var(--accent);
  text-transform:uppercase; letter-spacing:0.5px; margin-bottom:14px;
  padding-bottom:8px; border-bottom:1px solid var(--border);
}
.config-field {
  display:flex; justify-content:space-between; align-items:center;
  padding:6px 0;
}
.config-field label {
  color:var(--text-secondary); font-size:12px; flex:1;
}
.config-field input {
  width:100px; background:var(--bg-page); border:1px solid var(--border);
  border-radius:4px; padding:5px 10px; color:var(--text-primary);
  font-family:var(--font-mono); font-size:12px; text-align:right;
  transition:border-color .15s;
}
.config-field input:focus {
  outline:none; border-color:var(--accent);
}
.btn-save {
  margin-top:20px; padding:10px 32px; border:none; border-radius:6px;
  font-family:var(--font-mono); font-size:13px; font-weight:700;
  color:#fff; cursor:pointer;
  background:linear-gradient(135deg, #4EAEFD 0%, #3B7FD9 100%);
  transition:opacity .15s;
}
.btn-save:hover { opacity:0.9; }
.btn-save:disabled { opacity:0.5; cursor:not-allowed; }
.save-feedback {
  display:inline-block; margin-left:12px; font-size:12px;
  font-weight:600; opacity:0; transition:opacity .3s;
}
.save-feedback.show { opacity:1; }
.save-feedback.success { color:var(--profit); }
.save-feedback.error { color:var(--loss); }

/* ===== SUMMARY ROW ===== */
.summary-row {
  display:flex; gap:24px; padding:14px 16px;
  background:var(--bg-hover); border-top:1px solid var(--border);
  font-size:12px; font-weight:600; flex-wrap:wrap;
}
.summary-row .sr-item .sr-label {
  color:var(--text-muted); font-size:10px; text-transform:uppercase;
  letter-spacing:0.5px;
}
.summary-row .sr-item .sr-value {
  color:var(--text-primary); font-size:14px; font-weight:700; margin-top:2px;
}

/* ===== EMPTY STATE ===== */
.empty-state {
  text-align:center; padding:48px 16px; color:var(--text-muted);
  font-size:13px;
}

/* ===== ACTIVITY LOGS ===== */
.log-controls {
  display:flex; gap:8px; align-items:center; padding:10px 16px;
  border-bottom:1px solid var(--border); flex-wrap:wrap;
}
.log-filter-btn {
  padding:4px 10px; border:1px solid var(--border); border-radius:4px;
  background:transparent; color:var(--text-muted); font-family:var(--font-mono);
  font-size:11px; cursor:pointer; transition:all .15s;
}
.log-filter-btn:hover { color:var(--text-secondary); border-color:var(--text-muted); }
.log-filter-btn.active { color:var(--accent); border-color:var(--accent); background:rgba(78,174,253,0.08); }
.log-count { margin-left:auto; color:var(--text-muted); font-size:11px; }
.log-list {
  max-height:480px; overflow-y:auto; font-size:12px;
}
.log-entry {
  display:grid;
  grid-template-columns: 76px 62px 1fr;
  gap:8px; padding:5px 16px;
  border-bottom:1px solid rgba(49,56,86,0.3);
  line-height:1.6;
}
.log-entry:hover { background:var(--bg-hover); }
.log-time { color:var(--text-muted); white-space:nowrap; }
.log-level { font-weight:700; white-space:nowrap; font-size:11px; }
.log-level-DEBUG { color:var(--text-muted); }
.log-level-INFO { color:var(--accent); }
.log-level-WARNING { color:var(--warning); }
.log-level-ERROR { color:var(--loss); }
.log-level-CRITICAL { color:#ff4040; }
.log-msg { color:var(--text-secondary); word-break:break-word; }
.log-msg .log-extra { color:var(--text-muted); margin-left:6px; }
.log-auto-scroll { font-size:11px; display:flex; align-items:center; gap:4px; color:var(--text-muted); cursor:pointer; }
.log-auto-scroll input { cursor:pointer; }

/* ===== TOAST ===== */
.toast {
  position:fixed; bottom:24px; right:24px; z-index:200;
  padding:12px 20px; border-radius:6px; font-size:12px; font-weight:600;
  opacity:0; transform:translateY(10px);
  transition:opacity .3s, transform .3s;
  pointer-events:none;
}
.toast.show { opacity:1; transform:translateY(0); pointer-events:auto; }
.toast.toast-success { background:var(--profit); color:#fff; }
.toast.toast-error { background:var(--loss); color:#fff; }
.toast.toast-info { background:var(--accent); color:#fff; }

/* ===== RESPONSIVE ===== */
@media (max-width:1024px) {
  .header { padding:10px 16px; }
  .content { padding:16px; }
  .signal-row { grid-template-columns:1fr; gap:4px; }
}
</style>
</head>
<body>

<!-- ===== HEADER ===== -->
<header class="header">
  <div class="logo">&#9889; MOMENTUM BOT</div>
  <div class="header-badges">
    <span class="badge badge-status" id="hdr-status">
      <span class="status-dot stopped" id="hdr-dot"></span>
      <span id="hdr-status-text">Stopped</span>
    </span>
    <span class="badge badge-dry" id="hdr-dry" style="display:none">DRY-RUN</span>
    <span class="badge badge-test" id="hdr-test" style="display:none">TESTNET</span>
  </div>
  <div class="header-stats">
    <div class="header-stat">
      <div class="hs-label">Uptime</div>
      <div class="hs-value" id="hdr-uptime">--</div>
    </div>
    <div class="header-stat">
      <div class="hs-label">Balance</div>
      <div class="hs-value" id="hdr-balance">--</div>
    </div>
    <div class="header-stat">
      <div class="hs-label">Total PnL</div>
      <div class="hs-value" id="hdr-pnl">--</div>
    </div>
    <div class="header-stat">
      <div class="hs-label">Win Rate</div>
      <div class="hs-value" id="hdr-winrate">--</div>
    </div>
  </div>
  <button class="btn-emergency" id="btn-emergency" onclick="emergencyClose()">
    EMERGENCY CLOSE
  </button>
</header>

<!-- ===== TAB BAR ===== -->
<nav class="tab-bar">
  <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
  <button class="tab-btn" data-tab="positions">Positions</button>
  <button class="tab-btn" data-tab="orders">Orders &amp; Fills</button>
  <button class="tab-btn" data-tab="history">History</button>
  <button class="tab-btn" data-tab="logs">Logs</button>
  <button class="tab-btn" data-tab="config">Config</button>
</nav>

<!-- ===== CONTENT ===== -->
<main class="content">

  <!-- ===== DASHBOARD TAB ===== -->
  <section class="tab-panel active" id="panel-dashboard">
    <div class="stats-row">
      <div class="stat-card">
        <div class="label">Total PnL</div>
        <div class="value" id="dash-pnl">$0.00</div>
      </div>
      <div class="stat-card">
        <div class="label">Win Rate</div>
        <div class="value" id="dash-winrate">0%</div>
      </div>
      <div class="stat-card">
        <div class="label">Open Positions</div>
        <div class="value" id="dash-open">0</div>
      </div>
      <div class="stat-card">
        <div class="label">Scanned Coins</div>
        <div class="value" id="dash-scanned">0</div>
      </div>
    </div>

    <!-- Active Positions (compact) -->
    <div class="table-wrap">
      <div class="table-title">Active Positions</div>
      <table>
        <thead>
          <tr>
            <th>Coin</th><th>Direction</th><th class="text-right">Entry</th>
            <th class="text-right">Current</th><th class="text-right">PnL</th>
            <th class="text-right">PnL%</th><th class="text-right">R-Multiple</th>
            <th>Duration</th><th class="text-right">Trailing SL</th>
          </tr>
        </thead>
        <tbody id="dash-positions-body"></tbody>
      </table>
      <div class="empty-state" id="dash-positions-empty">No open positions</div>
    </div>

    <!-- Recent Signals -->
    <div class="table-wrap">
      <div class="table-title">Recent Signals</div>
      <div class="signals-list">
        <div class="signal-row signal-header">
          <span>Time</span><span>Coin</span><span>Direction</span>
          <span>Score</span><span class="text-right">Entry</span>
          <span class="text-right">SL</span><span class="text-right">TP</span>
          <span class="text-right">R:R</span><span>Status</span>
        </div>
        <div id="dash-signals-body"></div>
      </div>
      <div class="empty-state" id="dash-signals-empty">No recent signals</div>
    </div>

    <!-- Activity Logs (compact, last 30) -->
    <div class="table-wrap">
      <div class="table-title">Activity Logs</div>
      <div class="log-list" id="dash-logs" style="max-height:280px;"></div>
      <div class="empty-state" id="dash-logs-empty">No activity logs yet</div>
    </div>
  </section>

  <!-- ===== POSITIONS TAB ===== -->
  <section class="tab-panel" id="panel-positions">
    <div class="table-wrap">
      <div class="table-title">Open Positions</div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Coin</th><th>Direction</th><th class="text-right">Size</th>
              <th class="text-right">Notional</th><th class="text-right">Entry</th>
              <th class="text-right">Current</th><th class="text-right">SL</th>
              <th class="text-right">TP</th><th class="text-right">Trailing SL</th>
              <th class="text-right">PnL</th><th class="text-right">PnL%</th>
              <th class="text-right">Leverage</th><th class="text-right">Regime</th>
              <th>Duration</th><th>Status</th>
            </tr>
          </thead>
          <tbody id="pos-body"></tbody>
        </table>
      </div>
      <div class="empty-state" id="pos-empty">No open positions</div>
    </div>
  </section>

  <!-- ===== ORDERS & FILLS TAB ===== -->
  <section class="tab-panel" id="panel-orders">
    <!-- Open Orders -->
    <div class="table-wrap">
      <div class="table-title">Open Orders</div>
      <table>
        <thead>
          <tr>
            <th>Coin</th><th>Side</th><th>Type</th>
            <th class="text-right">Size</th><th class="text-right">Price</th>
            <th>Status</th><th>Time</th>
          </tr>
        </thead>
        <tbody id="orders-body"></tbody>
      </table>
      <div class="empty-state" id="orders-empty">No open orders</div>
    </div>

    <!-- Recent Fills -->
    <div class="table-wrap">
      <div class="table-title">Recent Fills</div>
      <table>
        <thead>
          <tr>
            <th>Coin</th><th>Side</th><th class="text-right">Size</th>
            <th class="text-right">Price</th><th class="text-right">Fee</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody id="fills-body"></tbody>
      </table>
      <div class="empty-state" id="fills-empty">No recent fills</div>
    </div>
  </section>

  <!-- ===== HISTORY TAB ===== -->
  <section class="tab-panel" id="panel-history">
    <div class="table-wrap">
      <div class="table-title">Closed Positions</div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Coin</th><th>Direction</th><th class="text-right">Entry</th>
              <th class="text-right">Exit</th><th class="text-right">Size</th>
              <th class="text-right">PnL</th><th class="text-right">PnL%</th>
              <th class="text-right">R-Multiple</th><th class="text-right">Regime</th>
              <th>Duration</th><th>Exit Reason</th><th>Time</th>
            </tr>
          </thead>
          <tbody id="history-body"></tbody>
        </table>
      </div>
      <div class="empty-state" id="history-empty">No closed positions</div>
      <div class="summary-row" id="history-summary" style="display:none;">
        <div class="sr-item">
          <div class="sr-label">Total PnL</div>
          <div class="sr-value" id="hist-total-pnl">$0.00</div>
        </div>
        <div class="sr-item">
          <div class="sr-label">Avg R-Multiple</div>
          <div class="sr-value" id="hist-avg-r">0.00</div>
        </div>
        <div class="sr-item">
          <div class="sr-label">Win Rate</div>
          <div class="sr-value" id="hist-winrate">0%</div>
        </div>
        <div class="sr-item">
          <div class="sr-label">Total Trades</div>
          <div class="sr-value" id="hist-total">0</div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===== LOGS TAB ===== -->
  <section class="tab-panel" id="panel-logs">
    <div class="table-wrap">
      <div class="table-title">System Activity Logs</div>
      <div class="log-controls">
        <button class="log-filter-btn active" data-level="">ALL</button>
        <button class="log-filter-btn" data-level="DEBUG">DEBUG</button>
        <button class="log-filter-btn" data-level="INFO">INFO</button>
        <button class="log-filter-btn" data-level="WARNING">WARN</button>
        <button class="log-filter-btn" data-level="ERROR">ERROR</button>
        <label class="log-auto-scroll">
          <input type="checkbox" id="log-autoscroll" checked/> Auto-scroll
        </label>
        <span class="log-count" id="log-count">0 entries</span>
      </div>
      <div class="log-list" id="logs-body" style="max-height:calc(100vh - 280px);"></div>
      <div class="empty-state" id="logs-empty">Waiting for activity logs...</div>
    </div>
  </section>

  <!-- ===== CONFIG TAB ===== -->
  <section class="tab-panel" id="panel-config">
    <form id="config-form" onsubmit="return saveConfig(event)">
      <div class="config-grid">

        <!-- Risk Settings -->
        <div class="config-section">
          <h3>Risk Settings</h3>
          <div class="config-field">
            <label for="cfg-max_risk_per_trade_pct">max_risk_per_trade_pct</label>
            <input type="number" step="0.01" id="cfg-max_risk_per_trade_pct" name="max_risk_per_trade_pct"/>
          </div>
          <div class="config-field">
            <label for="cfg-max_leverage">max_leverage</label>
            <input type="number" step="1" id="cfg-max_leverage" name="max_leverage"/>
          </div>
          <div class="config-field">
            <label for="cfg-max_concurrent_positions">max_concurrent_positions</label>
            <input type="number" step="1" id="cfg-max_concurrent_positions" name="max_concurrent_positions"/>
          </div>
          <div class="config-field">
            <label for="cfg-daily_loss_limit_pct">daily_loss_limit_pct</label>
            <input type="number" step="0.1" id="cfg-daily_loss_limit_pct" name="daily_loss_limit_pct"/>
          </div>
          <div class="config-field">
            <label for="cfg-max_drawdown_pct">max_drawdown_pct</label>
            <input type="number" step="0.1" id="cfg-max_drawdown_pct" name="max_drawdown_pct"/>
          </div>
        </div>

        <!-- Strategy Settings -->
        <div class="config-section">
          <h3>Strategy Settings</h3>
          <div class="config-field">
            <label for="cfg-regime_lookback_minutes">regime_lookback_minutes</label>
            <input type="number" step="1" id="cfg-regime_lookback_minutes" name="regime_lookback_minutes"/>
          </div>
          <div class="config-field">
            <label for="cfg-min_volume_per_minute_usd">min_volume_per_minute_usd</label>
            <input type="number" step="100" id="cfg-min_volume_per_minute_usd" name="min_volume_per_minute_usd"/>
          </div>
          <div class="config-field">
            <label for="cfg-limit_order_threshold_pct">limit_order_threshold_pct</label>
            <input type="number" step="0.01" id="cfg-limit_order_threshold_pct" name="limit_order_threshold_pct"/>
          </div>
          <div class="config-field">
            <label for="cfg-stale_position_timeout_minutes">stale_position_timeout_min</label>
            <input type="number" step="1" id="cfg-stale_position_timeout_minutes" name="stale_position_timeout_minutes"/>
          </div>
        </div>

        <!-- Staircase Settings -->
        <div class="config-section">
          <h3>Staircase Settings</h3>
          <div class="config-field">
            <label for="cfg-min_lookback_candles">min_lookback_candles</label>
            <input type="number" step="1" id="cfg-min_lookback_candles" name="min_lookback_candles"/>
          </div>
          <div class="config-field">
            <label for="cfg-pullback_ratio_threshold">pullback_ratio_threshold</label>
            <input type="number" step="0.01" id="cfg-pullback_ratio_threshold" name="pullback_ratio_threshold"/>
          </div>
          <div class="config-field">
            <label for="cfg-slope_consistency_threshold">slope_consistency_threshold</label>
            <input type="number" step="0.01" id="cfg-slope_consistency_threshold" name="slope_consistency_threshold"/>
          </div>
        </div>

        <!-- Volume Settings -->
        <div class="config-section">
          <h3>Volume Settings</h3>
          <div class="config-field">
            <label for="cfg-increase_threshold_pct">increase_threshold_pct</label>
            <input type="number" step="1" id="cfg-increase_threshold_pct" name="increase_threshold_pct"/>
          </div>
        </div>

        <!-- Scanner Settings -->
        <div class="config-section">
          <h3>Scanner Settings</h3>
          <div class="config-field">
            <label for="cfg-scan_interval_seconds">scan_interval_seconds</label>
            <input type="number" step="1" id="cfg-scan_interval_seconds" name="scan_interval_seconds"/>
          </div>
          <div class="config-field">
            <label for="cfg-top_n_candidates">top_n_candidates</label>
            <input type="number" step="1" id="cfg-top_n_candidates" name="top_n_candidates"/>
          </div>
          <div class="config-field">
            <label for="cfg-min_24h_volume_usd">min_24h_volume_usd</label>
            <input type="number" step="1000" id="cfg-min_24h_volume_usd" name="min_24h_volume_usd"/>
          </div>
        </div>

        <!-- Target Settings -->
        <div class="config-section">
          <h3>Target Settings</h3>
          <div class="config-field">
            <label for="cfg-default_rr">default_rr</label>
            <input type="number" step="0.1" id="cfg-default_rr" name="default_rr"/>
          </div>
          <div class="config-field">
            <label for="cfg-strong_regime_rr">strong_regime_rr</label>
            <input type="number" step="0.1" id="cfg-strong_regime_rr" name="strong_regime_rr"/>
          </div>
          <div class="config-field">
            <label for="cfg-trailing_trigger_r">trailing_trigger_r</label>
            <input type="number" step="0.1" id="cfg-trailing_trigger_r" name="trailing_trigger_r"/>
          </div>
          <div class="config-field">
            <label for="cfg-trailing_lock_r">trailing_lock_r</label>
            <input type="number" step="0.1" id="cfg-trailing_lock_r" name="trailing_lock_r"/>
          </div>
        </div>

      </div>

      <div style="margin-top:20px; display:flex; align-items:center;">
        <button type="submit" class="btn-save" id="btn-save">Save Configuration</button>
        <span class="save-feedback" id="save-feedback"></span>
      </div>
    </form>
  </section>

</main>

<!-- ===== TOAST ===== -->
<div class="toast" id="toast"></div>

<script>
/* ===== GLOBALS ===== */
var POLL_INTERVAL = 2000;
var pollTimer = null;
var currentTab = 'dashboard';
var cachedConfig = null;

/* ===== FORMATTING HELPERS ===== */
function fmtUsd(v) {
  if (v == null || isNaN(v)) return '--';
  var n = parseFloat(v);
  var sign = n >= 0 ? '' : '-';
  var abs = Math.abs(n);
  return sign + '$' + abs.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function fmtPct(v) {
  if (v == null || isNaN(v)) return '--';
  return parseFloat(v).toFixed(2) + '%';
}

function fmtPrice(v) {
  if (v == null || isNaN(v)) return '--';
  var n = parseFloat(v);
  if (n >= 1000) return n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(5);
}

function fmtR(v) {
  if (v == null || isNaN(v)) return '--';
  var n = parseFloat(v);
  return (n >= 0 ? '+' : '') + n.toFixed(2) + 'R';
}

function fmtDuration(ms) {
  if (ms == null || isNaN(ms) || ms <= 0) return '--';
  var totalSec = Math.floor(ms / 1000);
  var d = Math.floor(totalSec / 86400);
  var h = Math.floor((totalSec % 86400) / 3600);
  var m = Math.floor((totalSec % 3600) / 60);
  var s = totalSec % 60;
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm ' + s + 's';
}

function fmtRelative(ts) {
  if (!ts) return '--';
  var diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) diff = 0;
  var sec = Math.floor(diff / 1000);
  if (sec < 60) return sec + 's ago';
  var min = Math.floor(sec / 60);
  if (min < 60) return min + ' min ago';
  var hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  return Math.floor(hr / 24) + 'd ago';
}

function fmtTime(ts) {
  if (!ts) return '--';
  var d = new Date(ts);
  return d.toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

function pnlClass(v) {
  if (v == null) return '';
  return parseFloat(v) >= 0 ? 'pnl-pos' : 'pnl-neg';
}

function dirBadge(dir) {
  if (!dir) return '';
  var d = dir.toUpperCase();
  if (d === 'LONG' || d === 'BUY') return '<span class="badge badge-long">LONG</span>';
  return '<span class="badge badge-short">SHORT</span>';
}

function sideBadge(side) {
  if (!side) return '';
  var s = side.toUpperCase();
  if (s === 'BUY' || s === 'B') return '<span class="badge badge-long">BUY</span>';
  return '<span class="badge badge-short">SELL</span>';
}

function statusBadge(st) {
  if (!st) return '';
  var s = st.toUpperCase();
  var cls = 'badge-pending';
  if (s === 'FILLED') cls = 'badge-filled';
  else if (s === 'SKIPPED' || s === 'REJECTED') cls = 'badge-skipped';
  else if (s === 'CANCELED' || s === 'CANCELLED') cls = 'badge-canceled';
  return '<span class="badge ' + cls + '">' + s + '</span>';
}

/* ===== TAB SWITCHING ===== */
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    btn.classList.add('active');
    var tab = btn.getAttribute('data-tab');
    document.getElementById('panel-' + tab).classList.add('active');
    currentTab = tab;
    if (tab === 'config' && !cachedConfig) loadConfig();
  });
});

/* ===== TOAST ===== */
function showToast(msg, type) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast toast-' + (type || 'info') + ' show';
  setTimeout(function() { el.classList.remove('show'); }, 3000);
}

/* ===== EMERGENCY CLOSE ===== */
function emergencyClose() {
  if (!confirm('EMERGENCY CLOSE: This will close ALL open positions at market price. Are you sure?')) return;
  if (!confirm('This action is IRREVERSIBLE. Confirm again to proceed.')) return;
  fetch('/api/emergency-close', {method:'POST'})
    .then(function(r) {
      if (r.ok) showToast('Emergency close triggered', 'success');
      else throw new Error('Failed: ' + r.status);
    })
    .catch(function(e) { showToast(e.message, 'error'); });
}

/* ===== DATA FETCHING ===== */
function fetchJson(url) {
  return fetch(url).then(function(r) {
    if (!r.ok) throw new Error(r.status + '');
    return r.json();
  });
}

function pollAll() {
  fetchJson('/api/status').then(updateStatus).catch(function(){});
  fetchJson('/api/positions').then(updatePositions).catch(function(){});
  fetchJson('/api/signals').then(updateSignals).catch(function(){});
  fetchJson('/api/logs?limit=200').then(updateLogs).catch(function(){});
  if (currentTab === 'orders') {
    fetchJson('/api/fills').then(updateFills).catch(function(){});
  }
  if (currentTab === 'history') {
    fetchJson('/api/history').then(updateHistory).catch(function(){});
  }
}

/* ===== UPDATE: STATUS ===== */
function updateStatus(data) {
  var dot = document.getElementById('hdr-dot');
  var stxt = document.getElementById('hdr-status-text');
  if (data.running) {
    dot.className = 'status-dot running'; stxt.textContent = 'Running';
  } else {
    dot.className = 'status-dot stopped'; stxt.textContent = 'Stopped';
  }
  var dryEl = document.getElementById('hdr-dry');
  var testEl = document.getElementById('hdr-test');
  dryEl.style.display = data.dry_run ? 'inline-block' : 'none';
  testEl.style.display = data.testnet ? 'inline-block' : 'none';

  document.getElementById('hdr-uptime').textContent = fmtDuration(data.uptime_ms);
  document.getElementById('hdr-balance').textContent = fmtUsd(data.balance);
  var pnlEl = document.getElementById('hdr-pnl');
  pnlEl.textContent = fmtUsd(data.total_pnl);
  pnlEl.className = 'hs-value ' + pnlClass(data.total_pnl);
  document.getElementById('hdr-winrate').textContent = fmtPct(data.win_rate);

  /* dashboard stat cards */
  var dp = document.getElementById('dash-pnl');
  dp.textContent = fmtUsd(data.total_pnl);
  dp.className = 'value ' + pnlClass(data.total_pnl);
  document.getElementById('dash-winrate').textContent = fmtPct(data.win_rate);
  document.getElementById('dash-open').textContent = data.open_positions != null ? data.open_positions : '0';
  document.getElementById('dash-scanned').textContent = data.scanned_coins != null ? data.scanned_coins : '0';
}

/* ===== UPDATE: POSITIONS ===== */
function updatePositions(data) {
  var positions = Array.isArray(data) ? data : (data.positions || []);

  /* Dashboard compact table */
  var dashBody = document.getElementById('dash-positions-body');
  var dashEmpty = document.getElementById('dash-positions-empty');
  if (positions.length === 0) {
    dashBody.innerHTML = '';
    dashEmpty.style.display = 'block';
  } else {
    dashEmpty.style.display = 'none';
    dashBody.innerHTML = positions.map(function(p) {
      var dur = p.opened_at ? (Date.now() - new Date(p.opened_at).getTime()) : null;
      return '<tr>'
        + '<td>' + (p.coin || '--') + '</td>'
        + '<td>' + dirBadge(p.direction) + '</td>'
        + '<td class="text-right">' + fmtPrice(p.entry_price) + '</td>'
        + '<td class="text-right">' + fmtPrice(p.current_price) + '</td>'
        + '<td class="text-right ' + pnlClass(p.pnl) + '">' + fmtUsd(p.pnl) + '</td>'
        + '<td class="text-right ' + pnlClass(p.pnl_pct) + '">' + fmtPct(p.pnl_pct) + '</td>'
        + '<td class="text-right ' + pnlClass(p.r_multiple) + '">' + fmtR(p.r_multiple) + '</td>'
        + '<td class="text-muted">' + fmtDuration(dur) + '</td>'
        + '<td class="text-right text-secondary">' + fmtPrice(p.trailing_sl) + '</td>'
        + '</tr>';
    }).join('');
  }

  /* Full positions table */
  var posBody = document.getElementById('pos-body');
  var posEmpty = document.getElementById('pos-empty');
  if (positions.length === 0) {
    posBody.innerHTML = '';
    posEmpty.style.display = 'block';
  } else {
    posEmpty.style.display = 'none';
    posBody.innerHTML = positions.map(function(p) {
      var dur = p.opened_at ? (Date.now() - new Date(p.opened_at).getTime()) : null;
      return '<tr>'
        + '<td>' + (p.coin || '--') + '</td>'
        + '<td>' + dirBadge(p.direction) + '</td>'
        + '<td class="text-right">' + (p.size != null ? p.size : '--') + '</td>'
        + '<td class="text-right">' + fmtUsd(p.notional) + '</td>'
        + '<td class="text-right">' + fmtPrice(p.entry_price) + '</td>'
        + '<td class="text-right">' + fmtPrice(p.current_price) + '</td>'
        + '<td class="text-right text-secondary">' + fmtPrice(p.sl) + '</td>'
        + '<td class="text-right text-secondary">' + fmtPrice(p.tp) + '</td>'
        + '<td class="text-right text-secondary">' + fmtPrice(p.trailing_sl) + '</td>'
        + '<td class="text-right ' + pnlClass(p.pnl) + '">' + fmtUsd(p.pnl) + '</td>'
        + '<td class="text-right ' + pnlClass(p.pnl_pct) + '">' + fmtPct(p.pnl_pct) + '</td>'
        + '<td class="text-right">' + (p.leverage != null ? p.leverage + 'x' : '--') + '</td>'
        + '<td class="text-right">' + (p.regime_score != null ? p.regime_score : '--') + '</td>'
        + '<td class="text-muted">' + fmtDuration(dur) + '</td>'
        + '<td>' + statusBadge(p.status || 'OPEN') + '</td>'
        + '</tr>';
    }).join('');
  }
}

/* ===== UPDATE: SIGNALS ===== */
function updateSignals(data) {
  var signals = Array.isArray(data) ? data : (data.signals || []);
  var body = document.getElementById('dash-signals-body');
  var empty = document.getElementById('dash-signals-empty');
  if (signals.length === 0) {
    body.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    body.innerHTML = signals.map(function(s) {
      return '<div class="signal-row">'
        + '<span class="text-muted">' + fmtRelative(s.time) + '</span>'
        + '<span>' + (s.coin || '--') + '</span>'
        + '<span>' + dirBadge(s.direction) + '</span>'
        + '<span>' + (s.score != null ? s.score : '--') + '</span>'
        + '<span class="text-right">' + fmtPrice(s.entry) + '</span>'
        + '<span class="text-right">' + fmtPrice(s.sl) + '</span>'
        + '<span class="text-right">' + fmtPrice(s.tp) + '</span>'
        + '<span class="text-right">' + (s.rr != null ? s.rr.toFixed(1) : '--') + '</span>'
        + '<span>' + statusBadge(s.status) + '</span>'
        + '</div>';
    }).join('');
  }
}

/* ===== UPDATE: ORDERS & FILLS ===== */
function updateFills(data) {
  var orders = data.orders || [];
  var fills = data.fills || [];

  var oBody = document.getElementById('orders-body');
  var oEmpty = document.getElementById('orders-empty');
  if (orders.length === 0) {
    oBody.innerHTML = '';
    oEmpty.style.display = 'block';
  } else {
    oEmpty.style.display = 'none';
    oBody.innerHTML = orders.map(function(o) {
      return '<tr>'
        + '<td>' + (o.coin || '--') + '</td>'
        + '<td>' + sideBadge(o.side) + '</td>'
        + '<td>' + (o.type || '--') + '</td>'
        + '<td class="text-right">' + (o.size != null ? o.size : '--') + '</td>'
        + '<td class="text-right">' + fmtPrice(o.price) + '</td>'
        + '<td>' + statusBadge(o.status) + '</td>'
        + '<td class="text-muted">' + fmtRelative(o.time) + '</td>'
        + '</tr>';
    }).join('');
  }

  var fBody = document.getElementById('fills-body');
  var fEmpty = document.getElementById('fills-empty');
  if (fills.length === 0) {
    fBody.innerHTML = '';
    fEmpty.style.display = 'block';
  } else {
    fEmpty.style.display = 'none';
    fBody.innerHTML = fills.map(function(f) {
      return '<tr>'
        + '<td>' + (f.coin || '--') + '</td>'
        + '<td>' + sideBadge(f.side) + '</td>'
        + '<td class="text-right">' + (f.size != null ? f.size : '--') + '</td>'
        + '<td class="text-right">' + fmtPrice(f.price) + '</td>'
        + '<td class="text-right">' + fmtUsd(f.fee) + '</td>'
        + '<td class="text-muted">' + fmtRelative(f.time) + '</td>'
        + '</tr>';
    }).join('');
  }
}

/* ===== UPDATE: HISTORY ===== */
function updateHistory(data) {
  var trades = Array.isArray(data) ? data : (data.trades || []);
  var body = document.getElementById('history-body');
  var empty = document.getElementById('history-empty');
  var summary = document.getElementById('history-summary');

  if (trades.length === 0) {
    body.innerHTML = '';
    empty.style.display = 'block';
    summary.style.display = 'none';
  } else {
    empty.style.display = 'none';
    summary.style.display = 'flex';
    body.innerHTML = trades.map(function(t) {
      var dur = (t.opened_at && t.closed_at)
        ? (new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) : null;
      return '<tr>'
        + '<td>' + (t.coin || '--') + '</td>'
        + '<td>' + dirBadge(t.direction) + '</td>'
        + '<td class="text-right">' + fmtPrice(t.entry_price) + '</td>'
        + '<td class="text-right">' + fmtPrice(t.exit_price) + '</td>'
        + '<td class="text-right">' + (t.size != null ? t.size : '--') + '</td>'
        + '<td class="text-right ' + pnlClass(t.pnl) + '">' + fmtUsd(t.pnl) + '</td>'
        + '<td class="text-right ' + pnlClass(t.pnl_pct) + '">' + fmtPct(t.pnl_pct) + '</td>'
        + '<td class="text-right ' + pnlClass(t.r_multiple) + '">' + fmtR(t.r_multiple) + '</td>'
        + '<td class="text-right">' + (t.regime_score != null ? t.regime_score : '--') + '</td>'
        + '<td class="text-muted">' + fmtDuration(dur) + '</td>'
        + '<td>' + (t.exit_reason || '--') + '</td>'
        + '<td class="text-muted">' + fmtRelative(t.closed_at) + '</td>'
        + '</tr>';
    }).join('');

    /* Summary */
    var totalPnl = 0, totalR = 0, wins = 0;
    trades.forEach(function(t) {
      var pnl = parseFloat(t.pnl) || 0;
      totalPnl += pnl;
      totalR += parseFloat(t.r_multiple) || 0;
      if (pnl > 0) wins++;
    });
    var tp = document.getElementById('hist-total-pnl');
    tp.textContent = fmtUsd(totalPnl);
    tp.className = 'sr-value ' + pnlClass(totalPnl);
    document.getElementById('hist-avg-r').textContent = trades.length > 0 ? (totalR / trades.length).toFixed(2) + 'R' : '0.00R';
    document.getElementById('hist-winrate').textContent = trades.length > 0 ? (wins / trades.length * 100).toFixed(1) + '%' : '0%';
    document.getElementById('hist-total').textContent = trades.length;
  }
}

/* ===== LOGS ===== */
var logFilter = '';

function renderLogEntry(e) {
  var ts = e.timestamp || '';
  var t = ts.length > 19 ? ts.substring(11, 19) : ts;
  var lvl = (e.level || 'INFO').toUpperCase();
  var msg = e.event || '';
  var extra = '';
  if (e.extra) {
    var parts = [];
    for (var k in e.extra) {
      if (e.extra.hasOwnProperty(k)) {
        var v = e.extra[k];
        if (typeof v === 'object') v = JSON.stringify(v);
        parts.push(k + '=' + v);
      }
    }
    if (parts.length) extra = '<span class="log-extra">' + parts.join(' ') + '</span>';
  }
  var mod = e.module ? (e.module + (e.func ? '.' + e.func : '')) : '';
  if (mod) msg = '<strong>' + mod + '</strong> ' + msg;
  return '<div class="log-entry">'
    + '<span class="log-time">' + t + '</span>'
    + '<span class="log-level log-level-' + lvl + '">' + lvl + '</span>'
    + '<span class="log-msg">' + msg + extra + '</span>'
    + '</div>';
}

function updateLogs(data) {
  var logs = data.logs || [];
  var total = data.total || 0;

  /* Dashboard compact logs (last 30, no filter) */
  var dashLogs = document.getElementById('dash-logs');
  var dashEmpty = document.getElementById('dash-logs-empty');
  var recent30 = logs.slice(0, 30);
  if (recent30.length === 0) {
    dashLogs.innerHTML = '';
    dashEmpty.style.display = 'block';
  } else {
    dashEmpty.style.display = 'none';
    dashLogs.innerHTML = recent30.map(renderLogEntry).join('');
  }

  /* Full logs tab */
  var filtered = logFilter ? logs.filter(function(e) { return (e.level || '').toUpperCase() === logFilter; }) : logs;
  var body = document.getElementById('logs-body');
  var empty = document.getElementById('logs-empty');
  var countEl = document.getElementById('log-count');
  countEl.textContent = total + ' entries' + (logFilter ? ' (' + filtered.length + ' shown)' : '');
  if (filtered.length === 0) {
    body.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    body.innerHTML = filtered.map(renderLogEntry).join('');
    var autoScroll = document.getElementById('log-autoscroll');
    if (autoScroll && autoScroll.checked) {
      body.scrollTop = body.scrollHeight;
    }
  }
}

/* Log filter buttons */
document.querySelectorAll('.log-filter-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.log-filter-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    logFilter = btn.getAttribute('data-level') || '';
  });
});

/* ===== CONFIG ===== */
function loadConfig() {
  fetchJson('/api/config').then(function(data) {
    cachedConfig = data;
    var fields = document.querySelectorAll('#config-form input');
    fields.forEach(function(inp) {
      var key = inp.name;
      if (data[key] != null) inp.value = data[key];
    });
  }).catch(function(e) {
    showToast('Failed to load config', 'error');
  });
}

function saveConfig(e) {
  e.preventDefault();
  var btn = document.getElementById('btn-save');
  var fb = document.getElementById('save-feedback');
  btn.disabled = true;
  fb.className = 'save-feedback';
  fb.textContent = '';

  var payload = {};
  var fields = document.querySelectorAll('#config-form input');
  fields.forEach(function(inp) {
    var v = inp.value;
    if (v !== '' && v != null) {
      payload[inp.name] = parseFloat(v);
    }
  });

  fetch('/api/config', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  }).then(function(r) {
    if (!r.ok) throw new Error('Status ' + r.status);
    return r.json();
  }).then(function() {
    fb.textContent = 'Saved successfully';
    fb.className = 'save-feedback success show';
    showToast('Configuration saved', 'success');
    cachedConfig = payload;
  }).catch(function(e) {
    fb.textContent = 'Save failed: ' + e.message;
    fb.className = 'save-feedback error show';
    showToast('Failed to save config', 'error');
  }).finally(function() {
    btn.disabled = false;
    setTimeout(function() { fb.classList.remove('show'); }, 4000);
  });

  return false;
}

/* ===== INIT ===== */
(function init() {
  pollAll();
  pollTimer = setInterval(pollAll, POLL_INTERVAL);
})();
</script>
</body>
</html>
"""
