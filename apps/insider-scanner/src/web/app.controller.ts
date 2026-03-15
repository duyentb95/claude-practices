import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import { getAddress } from 'ethers';
import { InsiderDetectorService } from '../scanner/insider-detector.service';
import { LarkAlertService, DEFAULT_MEGA_TIERS, MegaTierConfig } from '../scanner/lark-alert.service';
import { WsScannerService } from '../scanner/ws-scanner.service';
import { LeaderboardMonitorService } from '../scanner/leaderboard-monitor.service';
import { SupabaseService } from '../frameworks/supabase/supabase.service';
import { minTradeUsd, megaTradeUsd, copinEnabled } from '../configs';

/** EIP-55 checksum address for Copin URL compatibility. */
function toChecksum(addr: string): string {
  try { return getAddress(addr); }
  catch { return addr; }
}

// ─── Embedded HTML dashboard ──────────────────────────────────────────────────

const DASHBOARD_HTML = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>⚡ Insider Scanner</title>
<style>
:root{
  --bg:#0d1117;
  --bg-card:#161b22;
  --bg-hover:#1c2128;
  --border:#21262d;
  --text:#c9d1d9;
  --dim:#8b949e;
  --bright:#f0f6fc;
  --cyan:#39c5cf;
  --green:#3fb950;
  --red:#f85149;
  --orange:#d18f52;
  --yellow:#d29922;
  --magenta:#bc8cff;
  --blue:#58a6ff;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'SF Mono',Menlo,Monaco,'Courier New',monospace;font-size:12px;line-height:1.4}

/* ─ Header ──────────────────────────────────── */
.hdr{
  background:var(--bg-card);border-bottom:1px solid var(--border);
  padding:10px 20px;display:flex;align-items:center;justify-content:space-between;
  position:sticky;top:0;z-index:99;
}
.hdr-logo{font-size:14px;font-weight:700;color:var(--cyan);letter-spacing:1.5px}
.hdr-left{display:flex;align-items:center;gap:20px}
.hdr-right{display:flex;align-items:center;gap:28px}
.stat-lbl{color:var(--dim);font-size:10px;letter-spacing:.5px;text-transform:uppercase}
.stat-val{font-size:13px;font-weight:600;color:var(--bright)}
.ws-ind{display:flex;align-items:center;gap:6px;font-size:11px}
.wsdot{width:7px;height:7px;border-radius:50%;background:var(--dim);flex-shrink:0;transition:background .3s}
.wsdot.on{background:var(--green);box-shadow:0 0 6px var(--green);animation:glow 2s ease-in-out infinite}
.wsdot.off{background:var(--red)}
@keyframes glow{0%,100%{box-shadow:0 0 5px var(--green)}50%{box-shadow:0 0 12px var(--green)}}
.up-chip{font-size:10px;color:var(--dim);border:1px solid var(--border);border-radius:12px;padding:1px 8px}

/* ─ Layout ───────────────────────────────────── */
.wrap{padding:14px 20px 48px}
.card{background:var(--bg-card);border:1px solid var(--border);border-radius:6px;margin-bottom:12px;overflow:hidden}
.card-hdr{padding:9px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.card-title{font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--bright)}
.card-sub{font-size:11px;color:var(--dim);margin-left:10px}

/* ─ Table ───────────────────────────────────── */
table{width:100%;border-collapse:collapse}
th{
  padding:7px 12px;text-align:left;
  color:var(--dim);font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.8px;
  border-bottom:1px solid var(--border);white-space:nowrap;background:var(--bg-card);
}
th.r{text-align:right}th.c{text-align:center}
td{padding:6px 12px;border-bottom:1px solid rgba(33,38,45,.6);white-space:nowrap;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--bg-hover)}
.r{text-align:right}.c{text-align:center}

/* ─ Colors ──────────────────────────────────── */
.cc{color:var(--cyan)}.cg{color:var(--green)}.cr{color:var(--red)}.co{color:var(--orange)}
.cy{color:var(--yellow)}.cm{color:var(--magenta)}.cb{color:var(--blue)}.cd{color:var(--dim)}.cw{color:var(--bright)}
.bold{font-weight:700}.f11{font-size:11px}.f10{font-size:10px}

/* ─ Badges ──────────────────────────────────── */
.badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;white-space:nowrap}
.b-mega {background:rgba(248,81,73,.12); color:var(--red);    border:1px solid rgba(248,81,73,.25)}
.b-first{background:rgba(188,140,255,.12);color:var(--magenta);border:1px solid rgba(188,140,255,.25)}
.b-new  {background:rgba(210,153,34,.12); color:var(--yellow); border:1px solid rgba(210,153,34,.25)}
.b-large{background:rgba(57,197,207,.08); color:var(--cyan);   border:1px solid rgba(57,197,207,.2)}
.b-buy  {background:rgba(63,185,80,.12);  color:var(--green);  padding:2px 8px}
.b-sell {background:rgba(248,81,73,.12);  color:var(--red);    padding:2px 8px}
/* Alert level badges */
.b-crit {background:rgba(248,81,73,.18); color:var(--red);    border:1px solid rgba(248,81,73,.4)}
.b-high {background:rgba(209,143,82,.18);color:var(--orange); border:1px solid rgba(209,143,82,.4)}
.b-med  {background:rgba(210,153,34,.18);color:var(--yellow); border:1px solid rgba(210,153,34,.4)}
.b-low  {background:rgba(88,166,255,.12);color:var(--blue);   border:1px solid rgba(88,166,255,.3)}
/* Wallet type / extra flag badges */
.b-ghost{background:rgba(188,140,255,.12);color:var(--magenta);border:1px solid rgba(188,140,255,.25)}
.b-one  {background:rgba(188,140,255,.2); color:var(--magenta);border:1px solid rgba(188,140,255,.45);font-weight:700}
.b-fresh{background:rgba(57,197,207,.12); color:var(--cyan);   border:1px solid rgba(57,197,207,.3)}
/* Copin archetype badges */
.b-algo  {background:rgba(139,148,158,.12);color:var(--dim);   border:1px solid rgba(139,148,158,.25)}
.b-smart {background:rgba(63,185,80,.12);  color:var(--green); border:1px solid rgba(63,185,80,.25)}
.b-degen {background:rgba(248,81,73,.1);   color:var(--red);   border:1px solid rgba(248,81,73,.2)}
.b-isusp {background:rgba(210,153,34,.18); color:var(--yellow);border:1px solid rgba(210,153,34,.4);font-weight:700}

/* ─ Misc ─────────────────────────────────────── */
.addr{font-size:11px}
.coin{font-size:13px;font-weight:700;color:var(--cyan)}
.copin{
  color:var(--dim);text-decoration:none;font-size:10px;
  padding:2px 7px;border:1px solid var(--border);border-radius:3px;transition:all .15s;
}
.copin:hover{color:var(--cyan);border-color:var(--cyan);background:rgba(57,197,207,.05)}
.log-wrap{padding:2px 0;max-height:180px;overflow-y:auto}
.log-ln{padding:3px 14px;font-size:11px;line-height:1.6}
.log-ln.alert{color:var(--yellow)}.log-ln.info{color:var(--dim)}
.empty{padding:20px;text-align:center;color:var(--dim);font-size:11px}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
::-webkit-scrollbar-thumb:hover{background:var(--dim)}

/* ─ Row flash ───────────────────────────────── */
@keyframes rowFlash{from{background:rgba(57,197,207,.1)}to{background:transparent}}
.flash td{animation:rowFlash 1.5s ease-out forwards}

/* ─ Search ──────────────────────────────────── */
.search-wrap{display:flex;align-items:center;gap:4px}
.search-inp{
  background:var(--bg);border:1px solid var(--border);border-radius:3px;
  color:var(--text);font-family:inherit;font-size:11px;
  padding:3px 8px;width:200px;outline:none;transition:border-color .15s;
}
.search-inp::placeholder{color:var(--dim)}
.search-inp:focus{border-color:var(--cyan)}
.search-clr{
  background:none;border:none;color:var(--dim);cursor:pointer;
  font-size:13px;line-height:1;padding:0 2px;display:none;
  transition:color .15s;
}
.search-clr:hover{color:var(--red)}

/* ─ Pager ───────────────────────────────────── */
.pager{
  display:flex;align-items:center;justify-content:space-between;
  padding:7px 14px;border-top:1px solid var(--border);
  background:var(--bg-card);
}
.pager-info{font-size:10px;color:var(--dim);letter-spacing:.3px}
.pager-btns{display:flex;align-items:center;gap:6px}
.pg-btn{
  background:transparent;border:1px solid var(--border);border-radius:3px;
  color:var(--dim);padding:2px 9px;cursor:pointer;font-size:10px;font-family:inherit;
  transition:all .15s;line-height:1.6;
}
.pg-btn:hover:not([disabled]){border-color:var(--cyan);color:var(--cyan);background:rgba(57,197,207,.05)}
.pg-btn[disabled]{opacity:.3;cursor:not-allowed}
.pg-label{font-size:10px;color:var(--text);min-width:88px;text-align:center}

/* ─ Bottom bar ──────────────────────────────── */
.btmbar{
  position:fixed;bottom:0;left:0;right:0;
  background:var(--bg-card);border-top:1px solid var(--border);
  padding:4px 20px;display:flex;align-items:center;justify-content:space-between;
  font-size:10px;color:var(--dim);
}
.rdot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--dim);margin-right:5px;transition:background .1s}
.rdot.active{background:var(--cyan)}

/* ─ Settings bar ────────────────────────── */
.settings-bar{
  background:var(--bg-card);border-bottom:1px solid var(--border);
  padding:0 20px;overflow:hidden;transition:max-height .25s ease;max-height:0;
}
.settings-bar.open{max-height:160px;padding:10px 20px}
.settings-toggle{
  background:none;border:1px solid var(--border);border-radius:3px;
  color:var(--dim);cursor:pointer;font-family:inherit;font-size:11px;
  padding:2px 10px;transition:all .15s;
}
.settings-toggle:hover{border-color:var(--cyan);color:var(--cyan)}
.settings-row{display:flex;align-items:center;gap:10px}
.settings-inp{
  background:var(--bg);border:1px solid var(--border);border-radius:3px;
  color:var(--text);font-family:inherit;font-size:11px;
  padding:5px 10px;width:420px;outline:none;transition:border-color .15s;
}
.settings-inp::placeholder{color:var(--dim)}
.settings-inp:focus{border-color:var(--cyan)}
.settings-btn{
  background:rgba(57,197,207,.1);border:1px solid var(--cyan);border-radius:3px;
  color:var(--cyan);cursor:pointer;font-family:inherit;font-size:11px;
  padding:4px 14px;transition:all .15s;font-weight:600;
}
.settings-btn:hover{background:rgba(57,197,207,.2)}
.settings-btn.danger{border-color:var(--red);color:var(--red);background:rgba(248,81,73,.08)}
.settings-btn.danger:hover{background:rgba(248,81,73,.15)}
.settings-status{font-size:10px;margin-left:6px}
</style>
</head>
<body>

<!-- Header -->
<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-logo">⚡ HYPERLIQUID INSIDER SCANNER</div>
    <div class="ws-ind">
      <div class="wsdot off" id="wsdot"></div>
      <span id="wstxt" class="cd">Connecting…</span>
    </div>
    <span class="up-chip" id="upchip">up 0s</span>
  </div>
  <div class="hdr-right">
    <div><div class="stat-lbl">Pairs</div><div class="stat-val" id="s-pairs">—</div></div>
    <div><div class="stat-lbl">Trades Recv</div><div class="stat-val" id="s-recv">—</div></div>
    <div><div class="stat-lbl">Large</div><div class="stat-val cy" id="s-large">—</div></div>
    <div><div class="stat-lbl">Suspects</div><div class="stat-val cr" id="s-susp">—</div></div>
    <div><div class="stat-lbl">Queue</div><div class="stat-val" id="s-queue">—</div></div>
    <div><div class="stat-lbl">Last Msg</div><div class="stat-val cd" id="s-last">—</div></div>
    <button class="settings-toggle" onclick="toggleSettings()" title="Lark webhook settings">⚙ Settings</button>
  </div>
</div>

<!-- Settings bar (collapsed by default) -->
<div class="settings-bar" id="settings-bar">
  <div class="settings-row">
    <span class="stat-lbl" style="min-width:90px">Lark Webhook</span>
    <input id="webhook-inp" class="settings-inp" type="text"
      placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/..."
      autocomplete="off" spellcheck="false">
    <button class="settings-btn" onclick="saveWebhook()">Save</button>
    <button class="settings-btn danger" onclick="removeWebhook()">Remove</button>
    <span class="settings-status" id="webhook-status"></span>
  </div>
  <div class="settings-row" id="tier-config-row" style="margin-top:8px;display:none">
    <span class="stat-lbl" style="min-width:90px">Mega Tiers</span>
    <span class="cd f10" style="min-width:100px">BTC/ETH/SOL $</span>
    <input id="tier-bluechip" class="settings-inp" type="number" style="width:100px" placeholder="5000000">
    <span class="cd f10" style="min-width:80px">XRP/HYPE $</span>
    <input id="tier-midcap" class="settings-inp" type="number" style="width:100px" placeholder="1000000">
    <span class="cd f10" style="min-width:70px">Others $</span>
    <input id="tier-lowcap" class="settings-inp" type="number" style="width:100px" placeholder="200000">
    <button class="settings-btn" onclick="saveTierConfig()">Apply</button>
    <span class="settings-status" id="tier-status"></span>
  </div>
</div>

<div class="wrap">

  <!-- Large Trades -->
  <div class="card">
    <div class="card-hdr">
      <div>
        <span class="card-title">Large Trades</span>
        <span class="card-sub" id="trades-sub">waiting…</span>
      </div>
      <div class="search-wrap">
        <input id="trades-search" class="search-inp" type="text" placeholder="Filter coin, address, side, flag…"
          oninput="onTradeFilter(this.value)" autocomplete="off" spellcheck="false">
        <button id="trades-clr" class="search-clr" onclick="clearTradeFilter()" title="Clear filter">✕</button>
      </div>
    </div>
    <div id="trades-wrap"><div class="empty">Waiting for trades…</div></div>
    <div class="pager" id="trades-pager" style="display:none">
      <span class="pager-info" id="trades-info"></span>
      <div class="pager-btns">
        <button class="pg-btn" id="trades-prev" onclick="tradePrev()">← Prev</button>
        <span class="pg-label" id="trades-page">Page 1 of 1</span>
        <button class="pg-btn" id="trades-next" onclick="tradeNext()">Next →</button>
      </div>
    </div>
  </div>

  <!-- Suspects -->
  <div class="card">
    <div class="card-hdr">
      <div>
        <span class="card-title">Suspicious Wallets</span>
        <span class="card-sub" id="susp-sub">sorted by risk score</span>
      </div>
      <div class="search-wrap">
        <input id="susp-search" class="search-inp" type="text" placeholder="Filter address, coin, level, type, flag…"
          oninput="onSuspFilter(this.value)" autocomplete="off" spellcheck="false">
        <button id="susp-clr" class="search-clr" onclick="clearSuspFilter()" title="Clear filter">✕</button>
      </div>
    </div>
    <div id="susp-wrap"><div class="empty">No suspects detected yet…</div></div>
    <div class="pager" id="susp-pager" style="display:none">
      <span class="pager-info" id="susp-info"></span>
      <div class="pager-btns">
        <button class="pg-btn" id="susp-prev" onclick="suspPrev()">← Prev</button>
        <span class="pg-label" id="susp-page">Page 1 of 1</span>
        <button class="pg-btn" id="susp-next" onclick="suspNext()">Next →</button>
      </div>
    </div>
  </div>

  <!-- Activity Log -->
  <div class="card">
    <div class="card-hdr">
      <span class="card-title">Activity Log</span>
    </div>
    <div class="log-wrap" id="log-wrap">
      <div class="empty">Waiting…</div>
    </div>
  </div>

</div>

<!-- Bottom bar -->
<div class="btmbar">
  <div><span class="rdot" id="rdot"></span><span id="rtime">--:--:--</span></div>
  <span id="reconn" class="cd"></span>
</div>

<script>
var lastHashes  = new Set();
var lastAddrs   = new Set();

// ─ Pagination + filter state ──────────────────────────────────────────────────
var PAGE_TRADES   = 10;
var PAGE_SUSPECTS = 10;
var tradePage = 0;
var suspPage  = 0;
var allTrades   = [];
var allSuspects = [];
var tradeFilter = '';
var suspFilter  = '';

function filteredTrades(){
  var q = tradeFilter.trim().toLowerCase();
  if(!q) return allTrades;
  return allTrades.filter(function(t){
    return t.coin.toLowerCase().indexOf(q) >= 0
      || (t.takerAddress||'').toLowerCase().indexOf(q) >= 0
      || t.side.toLowerCase().indexOf(q) >= 0
      || (t.flags||[]).some(function(f){ return f.toLowerCase().indexOf(q) >= 0; });
  });
}

function filteredSuspects(){
  var q = suspFilter.trim().toLowerCase();
  if(!q) return allSuspects;
  return allSuspects.filter(function(s){
    return s.address.toLowerCase().indexOf(q) >= 0
      || (s.coins||[]).some(function(c){ return c.toLowerCase().indexOf(q) >= 0; })
      || (s.alertLevel||'').toLowerCase().indexOf(q) >= 0
      || (s.walletType||'').toLowerCase().indexOf(q) >= 0
      || (s.flags||[]).some(function(f){ return f.toLowerCase().indexOf(q) >= 0; })
      || ((s.copinProfile&&s.copinProfile.archetype)||'').toLowerCase().indexOf(q) >= 0;
  });
}

function onTradeFilter(val){
  tradeFilter = val; tradePage = 0; renderTradesPage();
  document.getElementById('trades-clr').style.display = val ? 'inline' : 'none';
}
function clearTradeFilter(){
  tradeFilter = ''; tradePage = 0;
  document.getElementById('trades-search').value = '';
  document.getElementById('trades-clr').style.display = 'none';
  renderTradesPage();
}

function onSuspFilter(val){
  suspFilter = val; suspPage = 0; renderSuspPage();
  document.getElementById('susp-clr').style.display = val ? 'inline' : 'none';
}
function clearSuspFilter(){
  suspFilter = ''; suspPage = 0;
  document.getElementById('susp-search').value = '';
  document.getElementById('susp-clr').style.display = 'none';
  renderSuspPage();
}

// ─ Formatters ─────────────────────────────────────────────────────────────────
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function fmtUsd(n){
  if(n>=1e6) return '$'+(n/1e6).toFixed(2)+'M';
  if(n>=1e3) return '$'+(n/1e3).toFixed(0)+'K';
  return '$'+n.toFixed(0);
}
function fmtP(n){
  if(n>=1e3) return '$'+n.toLocaleString('en-US',{maximumFractionDigits:2});
  if(n>=1)   return '$'+n.toFixed(3);
  if(n>=1e-4) return '$'+n.toFixed(6);
  return '$'+n.toExponential(3);
}
function fmtT(ts){ return new Date(ts).toTimeString().slice(0,8) }
function shortAddr(a){ return a ? '0x'+a.slice(2,5)+'...'+a.slice(-3) : '' }
function fmtUp(ms){
  var s=Math.floor(ms/1000);
  if(s<60) return s+'s';
  var m=Math.floor(s/60);
  if(m<60) return m+'m '+(s%60)+'s';
  var h=Math.floor(m/60);
  return h+'h '+(m%60)+'m';
}
function fmtN(n){ return n.toLocaleString('en-US') }

// ─ Flag badges ────────────────────────────────────────────────────────────────
function flagBadges(arr){
  return (arr||[]).map(function(f){
    if(f==='MEGA')      return '<span class="badge b-mega">⚡MEGA</span>';
    if(f==='FIRST')     return '<span class="badge b-first">★FIRST</span>';
    if(f==='NEW_ACCT')  return '<span class="badge b-new">◆NEW</span>';
    if(f==='LARGE')     return '<span class="badge b-large">LARGE</span>';
    if(f==='FRESH_DEP') return '<span class="badge b-fresh">⏱FRESH_DEP</span>';
    if(f==='DEP_ONLY')  return '<span class="badge b-new">🏦DEP_ONLY</span>';
    if(f==='GHOST')     return '<span class="badge b-ghost">👻GHOST</span>';
    if(f==='ONE_SHOT')  return '<span class="badge b-one">🎯ONE_SHOT</span>';
    if(f==='ALL_IN')    return '<span class="badge b-mega">📈ALL_IN</span>';
    if(f==='HIGH_LEV')  return '<span class="badge b-new">⚠HIGH_LEV</span>';
    if(f==='DEAD_MKT')  return '<span class="badge b-large">💀DEAD_MKT</span>';
    if(f==='HIGH_OI')   return '<span class="badge b-new">📊HIGH_OI</span>';
    if(f==='HFT')        return '<span class="badge b-algo">🤖HFT</span>';
    if(f==='COPIN_SUSP') return '<span class="badge b-isusp">🎯COPIN</span>';
    if(f==='SMART')      return '<span class="badge b-smart">🧠SMART</span>';
    if(f==='LINKED')     return '<span class="badge b-isusp">🔗LINKED</span>';
    if(f==='LB_COIN')    return '<span class="badge b-new">📋LB_COIN</span>';
    return '<span class="badge b-large">'+esc(f)+'</span>';
  }).join(' ');
}

function alertLevelBadge(lvl, score){
  var cfg = {
    CRITICAL: ['b-crit', '🔴 CRITICAL'],
    HIGH:     ['b-high', '🟠 HIGH'],
    MEDIUM:   ['b-med',  '🟡 MEDIUM'],
    LOW:      ['b-low',  '🔵 LOW'],
    NONE:     ['b-large','⚪ NONE'],
  };
  var pair = cfg[lvl] || ['b-large', lvl||'?'];
  return '<span class="badge '+pair[0]+'" title="Score: '+(score||0)+'/100">'
       + pair[1]+' '+(score||0)
       + '</span>';
}

// ─ Copin archetype badge ──────────────────────────────────────────────────────
function copinBadge(cp){
  if(!cp) return '<span class="cd f10">—</span>';
  var arch = cp.archetype||'UNKNOWN';
  if(arch==='UNKNOWN') return '<span class="cd f10">—</span>';
  var cfgMap = {
    ALGO_HFT:        ['b-algo',  '🤖ALGO'],
    SMART_TRADER:    ['b-smart', '🧠SMART'],
    DEGEN:           ['b-degen', '💀DEGEN'],
    INSIDER_SUSPECT: ['b-isusp', '🎯SUSP'],
    NORMAL:          ['b-large', 'NORM'],
  };
  var pair = cfgMap[arch] || ['b-large', esc(arch)];
  var d30 = cp.d30;
  var tip = arch+' (conf '+(Math.round((cp.confidence||0)*100))+'%)';
  if(cp.signals && cp.signals.length) tip += ' | '+cp.signals.join(', ');
  if(d30) tip += ' | WR '+d30.winRate.toFixed(0)+'% '+d30.totalTrade+'T '+d30.totalLiquidation+'liq '+d30.runTimeDays+'d';
  return '<span class="badge '+pair[0]+'" title="'+esc(tip)+'">'+pair[1]+'</span>';
}

// ─ Render trades (slice of page) ──────────────────────────────────────────────
function renderTradeRows(slice){
  if(!slice||!slice.length) return '<div class="empty">Waiting for trades…</div>';
  var h = '<table><thead><tr>'
    + '<th>Time</th><th>Coin</th><th>Side</th>'
    + '<th class="r">USD Size</th><th class="r">Price</th>'
    + '<th class="c">Fills</th><th>Taker</th><th>Flags</th>'
    + '</tr></thead><tbody>';

  for(var i=0;i<slice.length;i++){
    var t = slice[i];
    var isNew = !lastHashes.has(t.hash);
    var cls   = isNew ? ' class="flash"' : '';
    var isMega = (t.flags||[]).indexOf('MEGA') >= 0;

    var side = t.side==='BUY'
      ? '<span class="badge b-buy">BUY</span>'
      : '<span class="badge b-sell">SELL</span>';

    var usd = isMega
      ? '<span class="bold cr">'+fmtUsd(t.usdSize)+'</span>'
      : '<span class="co">'+fmtUsd(t.usdSize)+'</span>';

    var fills = t.fillCount > 1
      ? '<span class="cy f10">'+t.fillCount+'f</span>'
      : '<span class="cd f10">1f</span>';

    var takerUrl = t.takerChecksumAddress ? 'https://app.copin.io/trader/'+encodeURIComponent(t.takerChecksumAddress)+'/HYPERLIQUID' : '';
    var taker = t.takerAddress
      ? '<span class="addr cb" title="'+esc(t.takerAddress)+'">'+esc(shortAddr(t.takerAddress))+'</span>'
        +' <a href="'+takerUrl+'" target="_blank" rel="noopener" class="copin">↗</a>'
      : '<span class="cd">unknown</span>';

    h += '<tr'+cls+'>'
      + '<td class="cd">'+fmtT(t.time)+'</td>'
      + '<td><span class="coin">'+esc(t.coin)+'</span></td>'
      + '<td>'+side+'</td>'
      + '<td class="r">'+usd+'</td>'
      + '<td class="r cd">'+fmtP(t.price)+'</td>'
      + '<td class="c">'+fills+'</td>'
      + '<td>'+taker+'</td>'
      + '<td>'+flagBadges(t.flags)+'</td>'
      + '</tr>';
  }
  return h + '</tbody></table>';
}

function renderTradesPage(){
  var data  = filteredTrades();
  var total = data.length;
  var allN  = allTrades.length;
  if(!allN){
    document.getElementById('trades-wrap').innerHTML = '<div class="empty">Waiting for trades…</div>';
    document.getElementById('trades-pager').style.display = 'none';
    return;
  }
  if(!total){
    document.getElementById('trades-wrap').innerHTML = '<div class="empty">No trades match filter…</div>';
    document.getElementById('trades-pager').style.display = 'none';
    return;
  }
  var pages = Math.ceil(total / PAGE_TRADES);
  tradePage = Math.min(tradePage, pages - 1);
  var start = tradePage * PAGE_TRADES;
  var slice = data.slice(start, start + PAGE_TRADES);

  document.getElementById('trades-wrap').innerHTML = renderTradeRows(slice);
  document.getElementById('trades-pager').style.display = 'flex';
  var infoTxt = (start+1)+'–'+Math.min(start+PAGE_TRADES, total)+' of '+total;
  if(tradeFilter) infoTxt += ' (filtered from '+allN+')';
  document.getElementById('trades-info').textContent = infoTxt;
  document.getElementById('trades-page').textContent = 'Page '+(tradePage+1)+' of '+pages;
  document.getElementById('trades-prev').disabled = tradePage === 0;
  document.getElementById('trades-next').disabled = tradePage >= pages - 1;
}

function tradePrev(){ if(tradePage > 0){ tradePage--; renderTradesPage(); } }
function tradeNext(){
  var pages = Math.ceil(allTrades.length / PAGE_TRADES);
  if(tradePage < pages-1){ tradePage++; renderTradesPage(); }
}

// ─ Render suspects (slice of page) ───────────────────────────────────────────
function renderSuspectRows(slice){
  if(!slice||!slice.length) return '<div class="empty">No suspects detected yet…</div>';
  var threshold = 30;
  var h = '<table><thead><tr>'
    + '<th>Wallet</th><th>Score</th><th>Copin</th><th class="r">Total USD</th><th class="c">Trades</th>'
    + '<th class="r">Acct Value</th><th class="r">90d Fills</th>'
    + '<th>Coins</th><th>Flags</th>'
    + '</tr></thead><tbody>';

  for(var i=0;i<slice.length;i++){
    var s = slice[i];
    var isNew = !lastAddrs.has(s.address);
    var cls   = isNew ? ' class="flash"' : '';

    var lvl = s.alertLevel || 'NONE';
    var ac = lvl==='CRITICAL' ? 'cr' : lvl==='HIGH' ? 'co' : lvl==='MEDIUM' ? 'cy' : 'cb';

    var fills = s.profile == null
      ? '<span class="cd">?</span>'
      : s.profile.fillCount90d === 0
        ? '<span class="cm bold">0</span>'
        : s.profile.fillCount90d < threshold
          ? '<span class="cy">'+s.profile.fillCount90d+'</span>'
          : '<span class="cd">'+s.profile.fillCount90d+'</span>';

    var acct = s.profile == null
      ? '<span class="cd">?</span>'
      : '<span class="cw">'+fmtUsd(s.profile.accountValue)+'</span>';

    var coins = (s.coins||[]).slice(0,6).join(', ');
    if((s.coins||[]).length > 6) coins += '…';

    var url = 'https://app.copin.io/trader/'+encodeURIComponent(s.checksumAddress||s.address)+'/HYPERLIQUID';

    h += '<tr'+cls+'>'
      + '<td><span class="addr '+ac+'" title="'+esc(s.address)+'">'+esc(shortAddr(s.address))+'</span>'
      + ' <a href="'+url+'" target="_blank" rel="noopener" class="copin">↗</a></td>'
      + '<td>'+alertLevelBadge(lvl, s.insiderScore)+'</td>'
      + '<td>'+copinBadge(s.copinProfile)+'</td>'
      + '<td class="r"><span class="bold co">'+fmtUsd(s.totalUsd)+'</span></td>'
      + '<td class="c cd">'+s.tradeCount+'</td>'
      + '<td class="r">'+acct+'</td>'
      + '<td class="r">'+fills+'</td>'
      + '<td class="cd f11">'+esc(coins)+'</td>'
      + '<td>'+flagBadges(s.flags)+'</td>'
      + '</tr>';
  }
  return h + '</tbody></table>';
}

function renderSuspPage(){
  var data  = filteredSuspects();
  var total = data.length;
  var allN  = allSuspects.length;
  if(!allN){
    document.getElementById('susp-wrap').innerHTML = '<div class="empty">No suspects detected yet…</div>';
    document.getElementById('susp-pager').style.display = 'none';
    document.getElementById('susp-sub').textContent = '0 wallets — sorted by risk score';
    return;
  }
  if(!total){
    document.getElementById('susp-wrap').innerHTML = '<div class="empty">No wallets match filter…</div>';
    document.getElementById('susp-pager').style.display = 'none';
    document.getElementById('susp-sub').textContent = '0 of '+allN+' wallets match';
    return;
  }
  var pages = Math.ceil(total / PAGE_SUSPECTS);
  suspPage = Math.min(suspPage, pages - 1);
  var start = suspPage * PAGE_SUSPECTS;
  var slice = data.slice(start, start + PAGE_SUSPECTS);

  document.getElementById('susp-wrap').innerHTML = renderSuspectRows(slice);
  document.getElementById('susp-pager').style.display = 'flex';
  var infoTxt = (start+1)+'–'+Math.min(start+PAGE_SUSPECTS, total)+' of '+total;
  if(suspFilter) infoTxt += ' (filtered from '+allN+')';
  document.getElementById('susp-info').textContent = infoTxt;
  document.getElementById('susp-page').textContent = 'Page '+(suspPage+1)+' of '+pages;
  document.getElementById('susp-prev').disabled = suspPage === 0;
  document.getElementById('susp-next').disabled = suspPage >= pages - 1;
  document.getElementById('susp-sub').textContent
    = (suspFilter ? total+' of '+allN : allN)+' wallets — sorted by risk score';
}

function suspPrev(){ if(suspPage > 0){ suspPage--; renderSuspPage(); } }
function suspNext(){
  var pages = Math.ceil(allSuspects.length / PAGE_SUSPECTS);
  if(suspPage < pages-1){ suspPage++; renderSuspPage(); }
}

// ─ Render log ─────────────────────────────────────────────────────────────────
function renderLog(logs){
  if(!logs||!logs.length) return '<div class="empty">Waiting…</div>';
  return logs.map(function(l){
    return '<div class="log-ln '+(l.indexOf('SUSPECT')>=0?'alert':'info')+'">'+esc(l)+'</div>';
  }).join('');
}

// ─ Main update ────────────────────────────────────────────────────────────────
function update(d){
  var st = d.stats;

  // WS status
  var dot = document.getElementById('wsdot');
  var txt = document.getElementById('wstxt');
  if(st.connected){
    dot.className='wsdot on'; txt.textContent='CONNECTED'; txt.className='cg';
  } else {
    dot.className='wsdot off'; txt.textContent='DISCONNECTED'; txt.className='cr';
  }

  // Header values
  document.getElementById('upchip').textContent = 'up '+fmtUp(d.uptime);
  document.getElementById('s-pairs').textContent = st.subscribedCoins;
  document.getElementById('s-recv').textContent  = fmtN(st.tradesReceived);
  document.getElementById('s-large').textContent = st.largeTradesFound;
  document.getElementById('s-susp').textContent  = st.suspectsFound;
  var qe = document.getElementById('s-queue');
  qe.textContent = st.queueLength;
  qe.className   = 'stat-val '+(st.queueLength > 5 ? 'cy' : 'cd');
  document.getElementById('s-last').textContent = st.lastMessageAt ? fmtT(st.lastMessageAt) : '—';
  document.getElementById('reconn').textContent = 'Reconnects: '+st.reconnects;

  // Trades — update data, keep page position, re-render
  allTrades = d.trades || [];
  document.getElementById('trades-sub').textContent
    = '>'+fmtUsd(d.minTradeUsd||50000)+' — '+allTrades.length+' total';
  renderTradesPage();
  lastHashes = new Set(allTrades.map(function(t){ return t.hash }));

  // Suspects — update data, keep page position, re-render
  allSuspects = d.suspects || [];
  renderSuspPage();
  lastAddrs = new Set(allSuspects.map(function(s){ return s.address }));

  // Log
  document.getElementById('log-wrap').innerHTML = renderLog(d.logs);

  // Refresh time
  document.getElementById('rtime').textContent = fmtT(Date.now());
}

// ─ Polling ────────────────────────────────────────────────────────────────────
function poll(){
  var rdot = document.getElementById('rdot');
  rdot.className = 'rdot active';
  fetch('/api/state')
    .then(function(r){ return r.json(); })
    .then(function(d){ update(d); })
    .catch(function(e){ console.error('poll error:', e); })
    .finally(function(){ setTimeout(function(){ rdot.className='rdot'; }, 300); });
}

poll();
setInterval(poll, 2000);

// ─ Settings: custom Lark webhook + tier config ─────────────────────────────
var WEBHOOK_KEY = 'insider_scanner_lark_webhook';
var TIER_KEY    = 'insider_scanner_mega_tiers';
var webhookRegistered = false;

// Default tiers (must match server DEFAULT_MEGA_TIERS)
var DEFAULT_TIERS = { bluechip: 5000000, midcap: 1000000, lowcap: 200000 };

function toggleSettings(){
  var bar = document.getElementById('settings-bar');
  bar.classList.toggle('open');
}

function webhookStatus(msg, color){
  var el = document.getElementById('webhook-status');
  el.textContent = msg;
  el.style.color = 'var(--' + (color || 'dim') + ')';
}

function tierStatus(msg, color){
  var el = document.getElementById('tier-status');
  el.textContent = msg;
  el.style.color = 'var(--' + (color || 'dim') + ')';
}

function showTierConfig(show){
  document.getElementById('tier-config-row').style.display = show ? 'flex' : 'none';
}

function loadTierInputs(){
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(TIER_KEY)); } catch(e){}
  var t = saved || DEFAULT_TIERS;
  document.getElementById('tier-bluechip').value = t.bluechip;
  document.getElementById('tier-midcap').value   = t.midcap;
  document.getElementById('tier-lowcap').value   = t.lowcap;
}

function getTierValues(){
  return {
    bluechip: parseInt(document.getElementById('tier-bluechip').value) || DEFAULT_TIERS.bluechip,
    midcap:   parseInt(document.getElementById('tier-midcap').value)   || DEFAULT_TIERS.midcap,
    lowcap:   parseInt(document.getElementById('tier-lowcap').value)   || DEFAULT_TIERS.lowcap,
  };
}

function saveWebhook(){
  var url = document.getElementById('webhook-inp').value.trim();
  if(!url){
    webhookStatus('Enter a webhook URL', 'red');
    return;
  }
  if(url.indexOf('https://') !== 0){
    webhookStatus('Must start with https://', 'red');
    return;
  }
  localStorage.setItem(WEBHOOK_KEY, url);
  var tiers = getTierValues();
  localStorage.setItem(TIER_KEY, JSON.stringify(tiers));
  registerWebhookOnServer(url, tiers);
}

function saveTierConfig(){
  var url = localStorage.getItem(WEBHOOK_KEY);
  if(!url){
    tierStatus('Set webhook first', 'red');
    return;
  }
  var tiers = getTierValues();
  localStorage.setItem(TIER_KEY, JSON.stringify(tiers));
  registerWebhookOnServer(url, tiers);
  tierStatus('✓ Tiers updated', 'green');
}

function removeWebhook(){
  var url = localStorage.getItem(WEBHOOK_KEY);
  localStorage.removeItem(WEBHOOK_KEY);
  localStorage.removeItem(TIER_KEY);
  document.getElementById('webhook-inp').value = '';
  webhookRegistered = false;
  showTierConfig(false);
  if(url){
    fetch('/api/webhook', {
      method: 'DELETE',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({url: url})
    }).then(function(){ webhookStatus('Webhook removed', 'dim'); })
      .catch(function(){ webhookStatus('Remove failed', 'red'); });
  } else {
    webhookStatus('No webhook to remove', 'dim');
  }
}

function registerWebhookOnServer(url, tiers){
  var body = { url: url };
  if(tiers) body.megaTiers = tiers;
  fetch('/api/webhook', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if(d.ok){
      webhookRegistered = true;
      webhookStatus('✓ Active — alerts will be sent here', 'green');
      showTierConfig(true);
      loadTierInputs();
    } else {
      webhookStatus('Error: ' + (d.error || 'unknown'), 'red');
    }
  })
  .catch(function(e){
    webhookStatus('Registration failed: ' + e.message, 'red');
  });
}

// On page load: restore from localStorage and register
(function(){
  var saved = localStorage.getItem(WEBHOOK_KEY);
  if(saved){
    document.getElementById('webhook-inp').value = saved;
    var tiers = null;
    try { tiers = JSON.parse(localStorage.getItem(TIER_KEY)); } catch(e){}
    registerWebhookOnServer(saved, tiers);
  }
  loadTierInputs();
})();

// Heartbeat: re-register every 30 min to keep TTL alive
setInterval(function(){
  var saved = localStorage.getItem(WEBHOOK_KEY);
  if(saved && webhookRegistered){
    var tiers = null;
    try { tiers = JSON.parse(localStorage.getItem(TIER_KEY)); } catch(e){}
    registerWebhookOnServer(saved, tiers);
  }
}, 30 * 60 * 1000);
</script>
</body>
</html>`;

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller()
export class AppController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly detector: InsiderDetectorService,
    private readonly lark: LarkAlertService,
    private readonly scanner: WsScannerService,
    private readonly leaderboardMonitor: LeaderboardMonitorService,
    private readonly supabase: SupabaseService,
  ) {}

  @Get('/')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  getIndex(): string {
    return DASHBOARD_HTML;
  }

  @Get('api/state')
  getState() {
    return {
      stats: this.scanner.stats,
      trades: this.detector.largeTrades.map((t) => ({
        ...t,
        takerChecksumAddress: t.takerAddress ? toChecksum(t.takerAddress) : null,
      })),
      suspects: this.detector.getSuspectsSorted().map((s) => ({
        address: s.address,
        checksumAddress: toChecksum(s.address),
        totalUsd: s.totalUsd,
        tradeCount: s.tradeCount,
        coins: [...s.coins],
        flags: [...s.flags],
        firstSeenAt: s.firstSeenAt,
        lastSeenAt: s.lastSeenAt,
        profile: s.profile,
        insiderScore: s.insiderScore,
        alertLevel: s.alertLevel,
        walletType: s.walletType,
        depositToTradeGapMs: s.depositToTradeGapMs,
        copinProfile: s.copinProfile ?? null,
      })),
      logs: this.detector.logs,
      minTradeUsd,
      megaTradeUsd,
      copinEnabled,
      defaultMegaTiers: DEFAULT_MEGA_TIERS,
      leaderboard: this.leaderboardMonitor.getStats(),
      uptime: Date.now() - this.startedAt,
    };
  }

  // ─── Custom Lark webhook management ─────────────────────────────────────────

  @Post('api/webhook')
  @HttpCode(200)
  registerWebhook(@Body() body: { url?: string; megaTiers?: Partial<MegaTierConfig> }) {
    const url = body?.url?.trim();
    if (!url) {
      return { ok: false, error: 'Missing url field' };
    }
    if (!url.startsWith('https://')) {
      return { ok: false, error: 'Webhook URL must start with https://' };
    }
    this.lark.registerWebhook(url, body.megaTiers);
    return { ok: true, message: 'Webhook registered', activeWebhooks: this.lark.customWebhookCount };
  }

  @Delete('api/webhook')
  @HttpCode(200)
  unregisterWebhook(@Body() body: { url?: string }) {
    const url = body?.url?.trim();
    if (!url) {
      return { ok: false, error: 'Missing url field' };
    }
    const deleted = this.lark.unregisterWebhook(url);
    return { ok: true, deleted, activeWebhooks: this.lark.customWebhookCount };
  }

  // ─── Evaluation API (suspect verdict tracking) ─────────────────────────────

  @Post('api/evaluate')
  @HttpCode(200)
  async evaluateSuspect(
    @Body() body: { address?: string; verdict?: string; notes?: string; evaluated_by?: string },
  ) {
    if (!this.supabase.enabled) {
      return { ok: false, error: 'Supabase not configured' };
    }

    const address = body?.address?.trim()?.toLowerCase();
    if (!address) {
      return { ok: false, error: 'Missing address field' };
    }

    const validVerdicts = ['TRUE_POSITIVE', 'FALSE_POSITIVE', 'UNCERTAIN'];
    const verdict = body?.verdict?.toUpperCase();
    if (!verdict || !validVerdicts.includes(verdict)) {
      return { ok: false, error: `Invalid verdict. Must be one of: ${validVerdicts.join(', ')}` };
    }

    const ok = await this.supabase.addEvaluation({
      address,
      verdict: verdict as 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'UNCERTAIN',
      notes: body.notes,
      evaluated_by: body.evaluated_by,
    });

    return { ok, address, verdict };
  }

  @Get('api/evaluations/:address')
  async getEvaluations(@Param('address') address: string) {
    if (!this.supabase.enabled) {
      return { ok: false, error: 'Supabase not configured', evaluations: [] };
    }

    const evaluations = await this.supabase.getEvaluations(address.toLowerCase());
    return { ok: true, address, evaluations };
  }

  @Get('api/accuracy')
  async getAccuracy() {
    if (!this.supabase.enabled) {
      return { ok: false, error: 'Supabase not configured' };
    }

    const [stats, byLevel] = await Promise.all([
      this.supabase.getAccuracyStats(),
      this.supabase.getAccuracyByAlertLevel(),
    ]);

    return {
      ok: true,
      ...stats,
      byAlertLevel: byLevel,
    };
  }
}