/**
 * App.jsx — Oya Spray 🎉
 * Redesigned sprayer app with:
 * - Clash Display + Satoshi + Cabinet Grotesk + JetBrains Mono fonts (via fontshare CDN)
 * - Bottom sheet panels (mobile-native)
 * - Confetti burst on join
 * - Guest profile card with avatar
 * - Hold-to-spray with charging ring animation
 * - Streak counter with fire emoji
 * - Per-coin color theming on spray pad
 * - Shimmer gradient gold
 * - Spinning 3D coins + banknote fiat drops
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useXRPL } from "./useXRPL";
import { SPRAY_COST_AMOUNT } from "./xrplService";
import { io } from "socket.io-client";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:4000";

// ─── Coin / Currency registry ─────────────────────────────────────────────────
const COINS = [
  { symbol: "BTC",  name: "Bitcoin",  type: "crypto", color: "#F7931A", bg: "#2D1400", symbol_char: "₿",  glyph: "B" },
  { symbol: "ETH",  name: "Ethereum", type: "crypto", color: "#627EEA", bg: "#0D1230", symbol_char: "Ξ",  glyph: "E" },
  { symbol: "XRP",  name: "XRP",      type: "crypto", color: "#00AAE4", bg: "#001A2D", symbol_char: "✕",  glyph: "X" },
  { symbol: "SOL",  name: "Solana",   type: "crypto", color: "#9945FF", bg: "#16002D", symbol_char: "◎",  glyph: "S" },
  { symbol: "ADA",  name: "Cardano",  type: "crypto", color: "#0033AD", bg: "#00082D", symbol_char: "₳",  glyph: "A" },
  { symbol: "NGN",  name: "Naira",    type: "fiat",   color: "#00A859", bg: "#001A0D", symbol_char: "₦",  glyph: "₦", noteColor: ["#1a6b3a","#0d4a27"], noteBg: "#0d4a27" },
  { symbol: "USD",  name: "Dollar",   type: "fiat",   color: "#1D9E75", bg: "#001A10", symbol_char: "$",  glyph: "$", noteColor: ["#1a4a2e","#0d3320"], noteBg: "#0d3320" },
  { symbol: "GBP",  name: "Pounds",   type: "fiat",   color: "#8B4FBE", bg: "#16002D", symbol_char: "£",  glyph: "£", noteColor: ["#4a1a7a","#300d55"], noteBg: "#300d55" },
  { symbol: "EUR",  name: "Euro",     type: "fiat",   color: "#1060C0", bg: "#001230", symbol_char: "€",  glyph: "€", noteColor: ["#1a3060","#0d1a40"], noteBg: "#0d1a40" },
  { symbol: "USDT", name: "Tether",   type: "crypto", color: "#26A17B", bg: "#001A13", symbol_char: "₮",  glyph: "T" },
];

const SCREENS = { ONBOARD: "onboard", WALLET: "wallet", SPRAY: "spray", HISTORY: "history" };

const AVATAR_COLORS = ["#E9A228","#F7931A","#00AAE4","#9945FF","#1D9E75","#D85A30","#627EEA","#00A859"];
const avatarColor = (name) => name ? AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] : "#E9A228";
const initials = (name) => name ? name.slice(0, 2).toUpperCase() : "??";

function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return Math.floor(d/1000) + "s ago";
  if (d < 3600000) return Math.floor(d/60000) + "m ago";
  return Math.floor(d/3600000) + "h ago";
}

// ─── Global CSS ───────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://api.fontshare.com/v2/css?f[]=clash-display@700,800&f[]=satoshi@400,500,600&f[]=cabinet-grotesk@700,800&f[]=jet-brains-mono@400,500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:         #080300;
    --surface:    #140800;
    --card:       #1C0C00;
    --border:     rgba(233,162,40,0.15);
    --gold:       #E9A228;
    --gold-lt:    #FAC75A;
    --gold-dk:    #C97D10;
    --muted:      #7A5F38;
    --text:       #F5E4C0;
    --text-dim:   #9A7A50;
    --green:      #00A859;
    --red:        #D85A30;
    --radius:     16px;
    --radius-sm:  11px;

    --coin-color: #E9A228;
    --coin-bg:    rgba(233,162,40,0.08);
    --pad-glow:   rgba(233,162,40,0.06);
  }

  html, body { background: var(--bg); color: var(--text); font-family: 'Satoshi', sans-serif; }
  #root { width: 100%; max-width: 430px; margin: 0 auto; min-height: 100vh; padding-bottom: 5rem; }

  /* ── Shimmer gold animation ── */
  @keyframes shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  .gold-shimmer {
    background: linear-gradient(90deg, var(--gold-dk) 0%, var(--gold) 40%, var(--gold-lt) 50%, var(--gold) 60%, var(--gold-dk) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer 3s linear infinite;
  }

  /* ── Header ── */
  .os-header {
    padding: 1.25rem 1.25rem 0.75rem;
    display: flex; align-items: center; justify-content: space-between;
    position: sticky; top: 0; z-index: 30;
    background: var(--bg);
    border-bottom: 0.5px solid var(--border);
  }
  .os-logo {
    font-family: 'Clash Display', sans-serif;
    font-size: 24px; font-weight: 800;
    letter-spacing: -0.5px;
  }
  .os-logo-oya { color: var(--gold); }
  .os-logo-spray { color: var(--text); }
  .os-event-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; font-weight: 500;
    padding: 5px 12px; border-radius: 20px;
    background: rgba(233,162,40,0.1);
    border: 0.5px solid rgba(233,162,40,0.25);
    color: var(--gold); letter-spacing: 1px;
  }

  /* ── Bottom Nav ── */
  .os-nav {
    position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
    width: 100%; max-width: 430px;
    display: flex; background: rgba(20,8,0,0.95);
    backdrop-filter: blur(16px);
    border-top: 0.5px solid var(--border);
    z-index: 40; padding-bottom: env(safe-area-inset-bottom, 0);
  }
  .nav-item {
    flex: 1; padding: 10px 0 8px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: none; border: none; cursor: pointer;
    color: var(--muted); font-family: 'Satoshi', sans-serif;
    transition: color 0.15s; -webkit-tap-highlight-color: transparent;
  }
  .nav-item.active { color: var(--gold); }
  .nav-icon { font-size: 18px; line-height: 1; }
  .nav-label { font-size: 9px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; }

  /* ── Page ── */
  .page { padding: 1.25rem; animation: pageIn 0.25s ease; }
  @keyframes pageIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  /* ── Bottom sheet card ── */
  .sheet {
    background: var(--card);
    border: 0.5px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 0.875rem;
  }
  .sheet-handle {
    width: 36px; height: 4px; border-radius: 2px;
    background: rgba(233,162,40,0.2);
    margin: 10px auto 0;
  }
  .sheet-inner { padding: 1.125rem 1.25rem 1.25rem; }
  .sheet-title {
    font-size: 10px; font-weight: 600;
    letter-spacing: 1.2px; text-transform: uppercase;
    color: var(--muted); margin-bottom: 0.875rem;
  }

  /* ── Inputs ── */
  .os-input {
    width: 100%; background: var(--surface);
    border: 0.5px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 13px 15px;
    color: var(--text); font-family: 'Satoshi', sans-serif;
    font-size: 15px; font-weight: 500;
    outline: none; margin-bottom: 0.75rem;
    transition: border-color 0.15s;
  }
  .os-input:focus { border-color: var(--gold); }
  .os-input::placeholder { color: var(--muted); }

  /* ── Buttons ── */
  .btn-primary {
    width: 100%; padding: 14px;
    border-radius: var(--radius-sm); border: none;
    background: linear-gradient(135deg, var(--gold-dk), var(--gold), var(--gold-lt));
    background-size: 200% auto;
    color: #1A0A00;
    font-family: 'Clash Display', sans-serif;
    font-size: 15px; font-weight: 700;
    cursor: pointer; transition: all 0.2s;
    animation: shimmer 3s linear infinite;
  }
  .btn-primary:hover { filter: brightness(1.1); }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; animation: none; background: var(--gold); }
  .btn-ghost {
    width: 100%; padding: 12px;
    border-radius: var(--radius-sm);
    border: 0.5px solid var(--border);
    background: transparent; color: var(--gold);
    font-family: 'Satoshi', sans-serif; font-size: 14px; font-weight: 600;
    cursor: pointer; margin-top: 0.5rem; transition: background 0.15s;
  }
  .btn-ghost:hover { background: rgba(233,162,40,0.07); }

  /* ── Onboard ── */
  .onboard-hero { padding: 2rem 1.25rem 1.5rem; text-align: center; }
  .onboard-mark {
    width: 88px; height: 88px; border-radius: 28px;
    background: rgba(233,162,40,0.1);
    border: 0.5px solid rgba(233,162,40,0.25);
    margin: 0 auto 1.5rem;
    display: flex; align-items: center; justify-content: center;
    font-size: 40px;
    box-shadow: 0 0 60px rgba(233,162,40,0.12);
  }
  .onboard-title {
    font-family: 'Clash Display', sans-serif;
    font-size: 36px; font-weight: 800;
    line-height: 1.1; margin-bottom: 0.5rem;
  }
  .onboard-sub { font-size: 14px; color: var(--muted); line-height: 1.6; }
  .testnet-chip {
    display: inline-block; padding: 4px 12px; border-radius: 20px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; font-weight: 500;
    background: rgba(0,170,228,0.1);
    border: 0.5px solid rgba(0,170,228,0.25); color: #00AAE4;
    letter-spacing: 0.5px; margin-bottom: 1.25rem;
  }

  /* ── Profile card ── */
  .profile-card {
    border-radius: var(--radius);
    padding: 1.25rem;
    background: var(--card);
    border: 0.5px solid var(--border);
    display: flex; align-items: center; gap: 1rem;
    margin-bottom: 0.875rem;
    animation: pageIn 0.3s ease;
  }
  .profile-avatar {
    width: 54px; height: 54px; border-radius: 18px;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Clash Display', sans-serif;
    font-size: 20px; font-weight: 800; flex-shrink: 0;
  }
  .profile-name { font-family: 'Clash Display', sans-serif; font-size: 20px; font-weight: 800; }
  .profile-event { font-size: 12px; color: var(--muted); margin-top: 3px; font-family: 'JetBrains Mono', monospace; }
  .profile-sprays { font-family: 'Cabinet Grotesk', sans-serif; font-size: 13px; color: var(--gold); font-weight: 700; margin-top: 5px; }

  /* ── Balance hero ── */
  .balance-hero {
    border-radius: var(--radius); padding: 1.75rem 1.25rem;
    background: var(--card); border: 0.5px solid var(--border);
    text-align: center; margin-bottom: 0.875rem;
    position: relative; overflow: hidden;
  }
  .balance-hero::after {
    content: '';
    position: absolute; bottom: -50px; left: 50%;
    transform: translateX(-50%);
    width: 220px; height: 110px;
    background: radial-gradient(ellipse, rgba(233,162,40,0.07), transparent 70%);
  }
  .bal-label { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; font-weight: 600; }
  .bal-amount {
    font-family: 'Cabinet Grotesk', sans-serif;
    font-size: 48px; font-weight: 800; line-height: 1;
  }
  .bal-unit { font-size: 13px; color: var(--muted); margin-top: 6px; font-family: 'JetBrains Mono', monospace; }
  .bal-address {
    margin-top: 1rem; padding: 9px 12px;
    background: var(--surface); border-radius: 9px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; color: var(--text-dim);
    text-align: left; word-break: break-all;
  }

  /* ── Coin carousel ── */
  .coin-carousel {
    display: flex; gap: 8px;
    overflow-x: auto; padding-bottom: 4px;
    scrollbar-width: none; margin-bottom: 1rem;
  }
  .coin-carousel::-webkit-scrollbar { display: none; }
  .coin-chip {
    flex-shrink: 0;
    display: flex; flex-direction: column; align-items: center;
    padding: 12px 10px; border-radius: 14px; min-width: 60px;
    border: 0.5px solid var(--border);
    background: var(--card); cursor: pointer;
    transition: all 0.15s; -webkit-tap-highlight-color: transparent;
  }
  .coin-chip.active {
    border-color: var(--coin-color);
    background: var(--coin-bg);
    box-shadow: 0 0 0 1px var(--coin-color);
  }
  .coin-chip-symbol {
    font-family: 'Clash Display', sans-serif;
    font-size: 13px; font-weight: 800; margin-bottom: 3px;
  }
  .coin-chip.active .coin-chip-symbol { color: var(--coin-color); }
  .coin-chip-name { font-size: 8px; color: var(--muted); font-weight: 600; letter-spacing: 0.3px; }
  .coin-chip.active .coin-chip-name { color: var(--coin-color); opacity: 0.7; }

  /* ── Spray pad ── */
  .spray-pad {
    border-radius: 20px;
    background: var(--card);
    border: 0.5px solid var(--border);
    padding: 2rem 1.25rem 1.75rem;
    text-align: center; margin-bottom: 0.875rem;
    position: relative; overflow: hidden; min-height: 260px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.25rem;
    transition: background 0.4s, border-color 0.4s;
  }
  .pad-glow {
    position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse at 50% 100%, var(--pad-glow) 0%, transparent 70%);
    transition: opacity 0.3s;
  }
  .spray-particles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }

  /* ── Charge ring ── */
  .charge-ring-wrap {
    position: absolute; width: 170px; height: 170px;
    display: flex; align-items: center; justify-content: center;
  }
  .charge-ring {
    position: absolute; width: 164px; height: 164px;
    border-radius: 50%; top: 0; left: 0;
  }
  .charge-ring svg { width: 164px; height: 164px; transform: rotate(-90deg); }
  .charge-circle {
    fill: none; stroke: var(--coin-color);
    stroke-width: 3; stroke-linecap: round;
    stroke-dasharray: 502;
    stroke-dashoffset: 502;
    transition: stroke-dashoffset 0.1s linear;
    opacity: 0.8;
  }

  /* ── Spray button ── */
  .spray-button {
    width: 130px; height: 130px; border-radius: 50%;
    border: none;
    background: linear-gradient(135deg, var(--gold-dk), var(--gold), var(--gold-lt));
    background-size: 200% auto;
    color: #1A0A00;
    font-family: 'Clash Display', sans-serif;
    font-size: 18px; font-weight: 800;
    cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    transition: transform 0.1s, box-shadow 0.3s, background 0.3s;
    box-shadow: 0 0 0 16px rgba(233,162,40,0.07), 0 0 0 32px rgba(233,162,40,0.03);
    -webkit-tap-highlight-color: transparent;
    user-select: none; position: relative; z-index: 1;
  }
  .spray-button.charging {
    animation: pulse-charge 0.5s ease-in-out infinite alternate, shimmer 1.5s linear infinite;
    box-shadow: 0 0 0 20px rgba(233,162,40,0.12), 0 0 0 42px rgba(233,162,40,0.05);
  }
  @keyframes pulse-charge {
    from { transform: scale(0.97); }
    to   { transform: scale(1.02); }
  }
  .spray-btn-label { font-size: 17px; font-weight: 800; }
  .spray-btn-coin { font-size: 10px; opacity: 0.65; font-weight: 700; letter-spacing: 1px; }

  /* ── Floating spray particles ── */
  .spray-particle {
    position: absolute; pointer-events: none;
    animation: particleFloat 1.1s ease-out forwards;
    font-family: 'Cabinet Grotesk', sans-serif;
    font-size: 12px; font-weight: 800;
    padding: 3px 9px; border-radius: 20px;
  }
  @keyframes particleFloat {
    0%   { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(-130px) scale(0.5) rotate(10deg); }
  }

  /* ── Streak counter ── */
  .streak-badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 14px; border-radius: 20px;
    font-family: 'Cabinet Grotesk', sans-serif;
    font-size: 13px; font-weight: 800;
    background: rgba(233,162,40,0.12);
    border: 0.5px solid rgba(233,162,40,0.3);
    color: var(--gold);
    animation: streakPop 0.3s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes streakPop { from { transform: scale(0.6); } to { transform: scale(1); } }

  /* ── Stat row ── */
  .stat-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 0.875rem; }
  .stat-box {
    background: var(--card); border: 0.5px solid var(--border);
    border-radius: 13px; padding: 14px;
  }
  .stat-val {
    font-family: 'Cabinet Grotesk', sans-serif;
    font-size: 26px; font-weight: 800; color: var(--gold);
  }
  .stat-lbl { font-size: 9px; color: var(--muted); font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; margin-top: 2px; }

  /* ── Status bars ── */
  .status-bar { padding: 11px 14px; border-radius: 11px; font-size: 13px; font-weight: 500; margin-bottom: 0.75rem; }
  .status-bar.error { background: rgba(216,90,48,0.1); color: #F09575; border: 0.5px solid rgba(216,90,48,0.2); }
  .status-bar.info  { background: rgba(0,168,89,0.1);  color: #5DCAA5; border: 0.5px solid rgba(0,168,89,0.2); }

  /* ── Spinner ── */
  .spinner { width: 20px; height: 20px; border: 2.5px solid rgba(233,162,40,0.2); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── History ── */
  .tx-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 0.5px solid var(--border); }
  .tx-item:last-child { border-bottom: none; }
  .tx-coin-badge { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0; font-family: 'Clash Display', sans-serif; }
  .tx-info { flex: 1; }
  .tx-name { font-size: 14px; font-weight: 600; font-family: 'Satoshi', sans-serif; }
  .tx-hash { font-size: 10px; color: #00AAE4; font-family: 'JetBrains Mono', monospace; cursor: pointer; text-decoration: underline; margin-top: 2px; display: block; }
  .tx-time { font-size: 10px; color: var(--muted); margin-top: 1px; }
  .tx-amt { font-family: 'Cabinet Grotesk', sans-serif; font-size: 14px; font-weight: 800; color: var(--red); white-space: nowrap; }

  /* ── Confetti pieces ── */
  .confetti-piece {
    position: fixed; pointer-events: none;
    width: 8px; height: 8px; border-radius: 2px;
    animation: confettiFall linear forwards;
    z-index: 999;
  }
  @keyframes confettiFall {
    0%   { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
    100% { opacity: 0; transform: translateY(100vh) rotate(720deg) scale(0.5); }
  }
    /* ── Receipt ── */
  .receipt-btn {
    width: 100%; padding: 14px; border-radius: var(--radius-sm);
    border: 0.5px solid var(--border);
    background: rgba(233,162,40,0.08);
    color: var(--gold); font-family: 'Clash Display', sans-serif;
    font-size: 14px; font-weight: 700;
    cursor: pointer; transition: background 0.15s;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    margin-top: 0.75rem;
  }
  .receipt-btn:hover { background: rgba(233,162,40,0.15); }
  .receipt-preview {
    width: 100%; border-radius: 12px; overflow: hidden;
    border: 0.5px solid var(--border); margin-top: 0.75rem;
  }
  .receipt-preview img { width: 100%; display: block; }
  .receipt-share-row { display: flex; gap: 8px; margin-top: 0.75rem; }
  .receipt-share-row .receipt-btn { margin-top: 0; }

    /* ── Speed slider ── */
  .speed-slider-wrap {
    background: var(--card); border: 0.5px solid var(--border);
    border-radius: 14px; padding: 14px 16px; margin-bottom: 0.875rem;
  }
  .speed-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .speed-label { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); }
  .speed-val { font-family: 'Cabinet Grotesk', sans-serif; font-size: 14px; font-weight: 800; color: var(--gold); }
  .speed-rail { width: 100%; height: 4px; border-radius: 2px; background: rgba(233,162,40,0.1); border: 0.5px solid rgba(233,162,40,0.15); position: relative; }
  .speed-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 2px; background: var(--gold); }
  .speed-thumb { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 22px; height: 22px; border-radius: 50%; background: var(--gold); border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 0 10px rgba(233,162,40,0.5); pointer-events: none; }
  .speed-range { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .speed-ticks { display: flex; justify-content: space-between; margin-top: 6px; }
  .speed-tick { font-size: 9px; color: var(--muted); letter-spacing: 0.5px; }
  .speed-tick.active { color: var(--gold); font-weight: 700; }
`;

// ─── Confetti burst ───────────────────────────────────────────────────────────
function triggerConfetti() {
  const colors = ["#E9A228","#FAC75A","#F7931A","#00A859","#00AAE4","#9945FF","#D85A30","#fff"];
  const pieces = [];
  for (let i = 0; i < 80; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    el.style.cssText = `
      left: ${10 + Math.random() * 80}%;
      top: ${-10 + Math.random() * 40}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.5}s;
      width: ${5 + Math.random() * 8}px;
      height: ${5 + Math.random() * 8}px;
      border-radius: ${Math.random() > 0.5 ? "50%" : "2px"};
    `;
    document.body.appendChild(el);
    pieces.push(el);
  }
  setTimeout(() => pieces.forEach(p => p.remove()), 3500);
}

// ─── Coin SVG component ───────────────────────────────────────────────────────
function CoinChipIcon({ coin, size = 22 }) {
  const c = COINS.find(x => x.symbol === coin) || COINS[0];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="18" fill={c.color + "22"} stroke={c.color} strokeWidth="1.5"/>
      <text x="20" y="26" textAnchor="middle" fontSize="16" fontWeight="800"
        fontFamily="'Clash Display', sans-serif" fill={c.color}>{c.glyph}</text>
    </svg>
  );
}

// ─── Screens ──────────────────────────────────────────────────────────────────

function OnboardScreen({ onDone, isLoading, error }) {
  const [displayName, setDisplayName] = useState("");
  const [eventCode, setEventCode] = useState("");

  return (
    <div className="page">
      <div className="onboard-hero">
        <div className="onboard-mark">🎉</div>
        <div className="onboard-title">
          <span className="gold-shimmer">Oya</span>{" "}
          <span style={{ color: "var(--text)" }}>Spray</span>
        </div>
        <div className="onboard-sub">
          Digital money spraying for Nigerian events.<br />
          Make it rain. For real.
        </div>
      </div>

      <div className="testnet-chip" style={{ display: "block", textAlign: "center", marginBottom: "1.25rem" }}>
        ⚡ ILP TESTNET — ilp.interledger-test.dev
      </div>

      {error && <div className="status-bar error">{error}</div>}

      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-inner">
          <div className="sheet-title">Join the celebration</div>
          <input className="os-input" placeholder="Your display name e.g. Obi O." value={displayName} onChange={e => setDisplayName(e.target.value)} />
          <input className="os-input" placeholder="Event code e.g. DM-9427" value={eventCode} onChange={e => setEventCode(e.target.value.toUpperCase())} />
          <button className="btn-primary" disabled={isLoading || !displayName || !eventCode} onClick={() => onDone({ displayName, eventCode })}>
            {isLoading ? <span className="spinner" /> : "Create Wallet & Join 🎊"}
          </button>
          <button className="btn-ghost" onClick={() => onDone({ displayName: displayName || "Guest", eventCode: "OYA-TEST" })}>
            Quick Demo (no code needed)
          </button>
        </div>
      </div>

      <div className="sheet">
        <div className="sheet-inner" style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
          <div className="sheet-title">How it works</div>
          A testnet ILP wallet is created for you instantly. Each spray sends real test funds to the event wallet on the Interledger testnet. Watch your name light up the big screen. 💸
        </div>
      </div>
    </div>
  );
}

function WalletScreen({ wallet, isLoading, refreshBalance, wsConnected, displayName,  eventWallet }) {
  if (!wallet) return null;
  const bal = parseFloat(wallet.balance || 0).toFixed(4);
  const color = avatarColor(displayName);

  return (
    <div className="page">
      {displayName && (
        <div className="profile-card">
          <div className="profile-avatar" style={{ background: color + "22", color }}>
            {initials(displayName)}
          </div>
          <div>
            <div className="profile-name">{displayName}</div>
            <div className="profile-event">
              <span style={{ color: wsConnected ? "var(--green)" : "var(--red)", marginRight: 5 }}>●</span>
              {wsConnected ? "Live — connected to event" : "Offline"}
            </div>
          </div>
        </div>
      )}

      <div className="balance-hero">
        <div className="bal-label">Testnet Balance</div>
        <div className="bal-amount gold-shimmer">{bal}</div>
        <div className="bal-unit">XRP (testnet)</div>
        <div className="bal-address">
          <div style={{ fontSize: 9, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 3, fontFamily: "Satoshi", color: "var(--muted)" }}>Your Address</div>
          {wallet.address}
        </div>
      </div>

      <div className="sheet">
        <div className="sheet-inner">
          <div className="sheet-title">Get More Test Funds</div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: "0.875rem", lineHeight: 1.6 }}>
            Your wallet was pre-funded on creation. Need more? Use the XRPL testnet faucet to top up.
          </p>
          <a href="https://faucet.altnet.rippletest.net/accounts" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <button className="btn-primary" style={{ marginBottom: "0.5rem" }}>Open Faucet ↗</button>
          </a>
          <button className="btn-ghost" onClick={refreshBalance} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh Balance"}
          </button>
        </div>
      </div>

      <div className="sheet">
  <div className="sheet-inner">
    <div className="sheet-title">All Sprays Go To</div>
    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--gold)", wordBreak: "break-all", lineHeight: 1.6 }}>
      {eventWallet || "Loading event wallet…"}
    </div>
  </div>
</div>
    </div>
  );
}
function SpeedSlider({ speed, onChange }) {
  const sliderVal = Math.round(((speed - 0.5) / 1.5) * 100);
  const label = speed <= 0.6 ? "🌦 Drizzle" : speed <= 0.9 ? "💧 Light" : speed <= 1.1 ? "⚡ Normal" : speed <= 1.5 ? "🌧 Heavy" : "🌊 Pour";
  function handleChange(e) {
    const mapped = 0.5 + (parseFloat(e.target.value) / 100) * 1.5;
    onChange(parseFloat(mapped.toFixed(2)));
  }
  return (
    <div className="speed-slider-wrap">
      <div className="speed-header">
        <span className="speed-label">Spray Speed</span>
        <span className="speed-val">{label}</span>
      </div>
      <div style={{ position: "relative", height: 28, display: "flex", alignItems: "center" }}>
        <div className="speed-rail">
          <div className="speed-fill" style={{ width: sliderVal + "%" }} />
          <div className="speed-thumb" style={{ left: sliderVal + "%" }} />
          <input type="range" className="speed-range" min="0" max="100" step="1" value={sliderVal} onChange={handleChange} />
        </div>
      </div>
      <div className="speed-ticks">
        {["Drizzle","Light","Normal","Heavy","Pour"].map((t, i) => (
          <span key={t} className={`speed-tick ${Math.round(sliderVal / 25) === i ? "active" : ""}`}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function SprayScreen({ wallet, doSpray, isLoading, error, totalSprayed, displayName, eventCode, spraySpeed, setSpraySpeed }) {
  const [activeCoin, setActiveCoin]     = useState("BTC");
  const [charging, setCharging]         = useState(false);
  const [chargeLevel, setChargeLevel]   = useState(0);
  const [particles, setParticles]       = useState([]);
  const [streak, setStreak]             = useState(0);
  const [lastHash, setLastHash]         = useState(null);
  const [localSprays, setLocalSprays]   = useState(0);
  const [localXRP, setLocalXRP]         = useState(0);

  const sprayIntervalRef = useRef(null);
  const chargeIntervalRef = useRef(null);
  const pidRef = useRef(0);
  const streakTimerRef = useRef(null);

  const coinDef = COINS.find(c => c.symbol === activeCoin) || COINS[0];

  function selectCoin(symbol) {
    const c = COINS.find(x => x.symbol === symbol);
    if (!c) return;
    setActiveCoin(symbol);
    document.documentElement.style.setProperty("--coin-color", c.color);
    document.documentElement.style.setProperty("--coin-bg", c.color + "18");
    document.documentElement.style.setProperty("--pad-glow", c.color + "10");
  }

  useEffect(() => {
    selectCoin("BTC");
  }, []);

  function addParticle() {
    const id = ++pidRef.current;
    setParticles(p => [...p, { id, x: 25 + Math.random() * 50, coin: activeCoin, color: coinDef.color }]);
    setTimeout(() => setParticles(p => p.filter(pt => pt.id !== id)), 1200);
  }

  const startSpray = useCallback(() => {
    if (charging) return;
    setCharging(true);
    setChargeLevel(0);

    // Charge ring fills over 0.6s then fires
    let level = 0;
    chargeIntervalRef.current = setInterval(() => {
      level = Math.min(level + 8, 100);
      setChargeLevel(level);
      if (level >= 100) {
        clearInterval(chargeIntervalRef.current);
        fireSpray();
        sprayIntervalRef.current = setInterval(fireSpray, 900);
      }
    }, 48);
  }, [charging, activeCoin, doSpray, displayName, eventCode]);

  
  async function fireSpray() {
    addParticle();
    try {
      const entry = await doSpray({ displayName, coin: activeCoin, eventId: eventCode, amountXRP: SPRAY_COST_AMOUNT });
      setLastHash(entry.hash);
      setLocalSprays(n => n + 1);
      setLocalXRP(n => parseFloat((n + parseFloat(SPRAY_COST_AMOUNT)).toFixed(6)));

      // Streak
      setStreak(s => s + 1);
      clearTimeout(streakTimerRef.current);
      streakTimerRef.current = setTimeout(() => setStreak(0), 3000);
    } catch (_) {}
  }

  const stopSpray = useCallback(() => {
    setCharging(false);
    setChargeLevel(0);
    clearInterval(sprayIntervalRef.current);
    clearInterval(chargeIntervalRef.current);
  }, []);

  useEffect(() => () => {
    clearInterval(sprayIntervalRef.current);
    clearInterval(chargeIntervalRef.current);
    clearTimeout(streakTimerRef.current);
  }, []);

  const dashOffset = 502 - (502 * chargeLevel / 100);
  const streakEmoji = streak >= 20 ? "🔥🔥🔥" : streak >= 10 ? "🔥🔥" : streak >= 5 ? "🔥" : null;

  return (
    <div className="page">
      {error && <div className="status-bar error">{error}</div>}
      {lastHash && (
        <div className="status-bar info">
          ✓ Sprayed! &nbsp;
          <a href={`https://testnet.xrpl.org/transactions/${lastHash}`} target="_blank" rel="noreferrer"
            style={{ color: "#00AAE4", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>
            {lastHash.slice(0, 18)}…
          </a>
        </div>
      )}
<SpeedSlider speed={spraySpeed} onChange={setSpraySpeed} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-inner">
          <div className="sheet-title">Select Coin to Spray</div>
          <div className="coin-carousel">
            {COINS.map(c => (
              <div key={c.symbol}
                className={`coin-chip ${activeCoin === c.symbol ? "active" : ""}`}
                onClick={() => selectCoin(c.symbol)}
                style={activeCoin === c.symbol ? { "--coin-color": c.color, "--coin-bg": c.color + "18" } : {}}
              >
                <CoinChipIcon coin={c.symbol} size={26} />
                <div className="coin-chip-symbol" style={{ color: activeCoin === c.symbol ? c.color : "var(--text)", marginTop: 4 }}>{c.symbol}</div>
                <div className="coin-chip-name">{c.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Spray pad */}
      <div className="spray-pad" style={{ borderColor: charging ? coinDef.color + "40" : "var(--border)" }}>
        <div className="pad-glow" style={{ opacity: charging ? 1 : 0.5 }} />
        <div className="spray-particles">
          {particles.map(p => (
            <div key={p.id} className="spray-particle"
              style={{ left: p.x + "%", bottom: "38%", background: p.color + "20", color: p.color, border: `0.5px solid ${p.color}40` }}>
              +{p.coin}
            </div>
          ))}
        </div>

        {streak > 1 && (
          <div className="streak-badge">
            {streakEmoji || "⚡"} {streak}× Streak
          </div>
        )}

        <div className="charge-ring-wrap">
          <div className="charge-ring">
            <svg viewBox="0 0 164 164">
              <circle className="charge-circle" cx="82" cy="82" r="80"
                style={{ strokeDashoffset: dashOffset, stroke: coinDef.color }} />
            </svg>
          </div>
          <button
            className={`spray-button ${charging ? "charging" : ""}`}
            style={charging ? {
              background: `linear-gradient(135deg, ${coinDef.color}cc, ${coinDef.color}, ${coinDef.color}aa)`,
              backgroundSize: "200% auto"
            } : {}}
            onMouseDown={startSpray} onMouseUp={stopSpray} onMouseLeave={stopSpray}
            onTouchStart={e => { e.preventDefault(); startSpray(); }} onTouchEnd={stopSpray}
          >
            <span className="spray-btn-label">SPRAY</span>
            <span className="spray-btn-coin">{activeCoin}</span>
          </button>
        </div>

        <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "1px", textTransform: "uppercase" }}>
          Hold to charge · Release to spray
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-val">{localSprays}</div>
          <div className="stat-lbl">Sprays Sent</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{localXRP.toFixed(2)}</div>
          <div className="stat-lbl">XRP Sprayed</div>
        </div>
      </div>
    </div>
  );
}
function generateReceiptCanvas({ displayName, eventName, hashtag, totalSprayed, sprayCount, rank, accentColor = "#E9A228" }) {
  const canvas = document.createElement("canvas");
  canvas.width  = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#080300";
  ctx.fillRect(0, 0, 1080, 1920);

  // Radial glow
  const glow = ctx.createRadialGradient(540, 600, 0, 540, 600, 700);
  glow.addColorStop(0, accentColor + "22");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1920);

  // Gold border card
  ctx.strokeStyle = accentColor + "55";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(60, 200, 960, 1520, 32);
  ctx.stroke();

  // Card inner bg
  ctx.fillStyle = "#12080088";
  ctx.beginPath();
  ctx.roundRect(60, 200, 960, 1520, 32);
  ctx.fill();

  // Top decorative line
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(200, 200);
  ctx.lineTo(880, 200);
  ctx.stroke();

  // Logo
  ctx.font = "bold 52px sans-serif";
  ctx.fillStyle = accentColor;
  ctx.textAlign = "center";
  ctx.fillText("OyaSpray", 540, 330);

  // Hashtag
  if (hashtag) {
    ctx.font = "bold 38px sans-serif";
    ctx.fillStyle = accentColor + "cc";
    ctx.fillText(hashtag, 540, 395);
  }

  // Divider
  ctx.strokeStyle = accentColor + "30";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(160, 430);
  ctx.lineTo(920, 430);
  ctx.stroke();

  // Avatar circle
  ctx.fillStyle = accentColor + "22";
  ctx.beginPath();
  ctx.arc(540, 580, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accentColor + "66";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Initials in avatar
  ctx.font = "bold 88px sans-serif";
  ctx.fillStyle = accentColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((displayName || "??").slice(0, 2).toUpperCase(), 540, 580);

  // Display name
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 64px sans-serif";
  ctx.fillStyle = "#F5E6C8";
  ctx.fillText(displayName, 540, 770);

  // Subtitle
  ctx.font = "500 32px sans-serif";
  ctx.fillStyle = "#9A7A50";
  ctx.fillText("MADE IT RAIN AT", 540, 830);

  // Event name
  ctx.font = "bold 42px sans-serif";
  ctx.fillStyle = "#F5E6C8";
  ctx.fillText(eventName || "The Event", 540, 890);

  // Stats row background
  ctx.fillStyle = accentColor + "12";
  ctx.beginPath();
  ctx.roundRect(120, 960, 840, 220, 20);
  ctx.fill();
  ctx.strokeStyle = accentColor + "30";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Total sprayed stat
  ctx.font = "bold 80px sans-serif";
  ctx.fillStyle = accentColor;
  ctx.textAlign = "center";
  ctx.fillText(parseFloat(totalSprayed).toFixed(2), 360, 1080);
  ctx.font = "500 26px sans-serif";
  ctx.fillStyle = "#9A7A50";
  ctx.fillText("XRP SPRAYED", 360, 1120);

  // Divider between stats
  ctx.strokeStyle = accentColor + "25";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(540, 975);
  ctx.lineTo(540, 1165);
  ctx.stroke();

  // Leaderboard rank stat
  ctx.font = "bold 80px sans-serif";
  ctx.fillStyle = rank === 1 ? "#FAC75A" : "#F5E6C8";
  ctx.fillText(rank === 1 ? "👑 #1" : `#${rank}`, 720, 1080);
  ctx.font = "500 26px sans-serif";
  ctx.fillStyle = "#9A7A50";
  ctx.fillText("LEADERBOARD", 720, 1120);

  // Spray count
  ctx.font = "500 30px sans-serif";
  ctx.fillStyle = "#9A7A50";
  ctx.fillText(`${sprayCount} sprays sent`, 540, 1230);

  // Bottom divider
  ctx.strokeStyle = accentColor + "30";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(160, 1280);
  ctx.lineTo(920, 1280);
  ctx.stroke();

  // Footer text
  ctx.font = "500 28px sans-serif";
  ctx.fillStyle = "#9A7A50";
  ctx.fillText("Powered by Interledger Open Payments", 540, 1360);

  ctx.font = "bold 30px sans-serif";
  ctx.fillStyle = accentColor + "88";
  ctx.fillText("oyaspray.io", 540, 1410);

  // Bottom gold line
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(200, 1700);
  ctx.lineTo(880, 1700);
  ctx.stroke();

  return canvas;
}

function downloadReceipt(canvas, displayName) {
  const link = document.createElement("a");
  link.download = `OyaSpray-${displayName}-receipt.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
function ReceiptCard({ displayName, eventName, hashtag, totalSprayed, sprayCount, leaderboard, accentColor }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const rank = leaderboard.findIndex(e => e.name === displayName) + 1 || leaderboard.length + 1;

  function generate() {
    const canvas = generateReceiptCanvas({
      displayName, eventName, hashtag, totalSprayed, sprayCount,
      rank, accentColor,
    });
    setPreviewUrl(canvas.toDataURL("image/png"));
    return canvas;
  }

  function handleDownload() {
    downloadReceipt(generate(), displayName);
  }

  function handleShare() {
    const canvas = generate();
    canvas.toBlob(async (blob) => {
      const file = new File([blob], `OyaSpray-${displayName}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "OyaSpray Receipt", text: hashtag || "I made it rain! 🎊" });
      } else {
        downloadReceipt(canvas, displayName);
      }
    });
  }

  return (
    <div className="sheet">
      <div className="sheet-inner">
        <div className="sheet-title">Your Spray Receipt 🏆</div>

        {previewUrl && (
          <div className="receipt-preview">
            <img src={previewUrl} alt="Receipt" />
          </div>
        )}

        <div className="receipt-share-row">
          <button className="receipt-btn" onClick={handleDownload}>
            ⬇️ Save Image
          </button>
          <button className="receipt-btn" onClick={handleShare}>
            📤 Share
          </button>
        </div>

        {!previewUrl && (
          <button className="receipt-btn" onClick={generate}>
            🎊 Generate My Receipt
          </button>
        )}
      </div>
    </div>
  );
}

function HistoryScreen({ sprayHistory, totalSprayed, displayName, eventCode, eventName, hashtag, leaderboard, accentColor }) {
  if (!sprayHistory.length) {
    return (
      <div className="page">
        <div className="sheet">
          <div className="sheet-inner" style={{ textAlign: "center", padding: "2.5rem", color: "var(--muted)" }}>
            <div style={{ fontSize: 36, marginBottom: "0.75rem" }}>💸</div>
            <div style={{ fontFamily: "Clash Display, sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>No sprays yet</div>
            Head to Spray and make it rain!
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-val">{sprayHistory.length}</div>
          <div className="stat-lbl">Total Sprays</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{totalSprayed.toFixed(3)}</div>
          <div className="stat-lbl">XRP Sprayed</div>
        </div>
      </div>

      {/* Receipt generator */}
  {sprayHistory.length > 0 && (
    <ReceiptCard
      displayName={displayName}
      eventName={eventName}
      hashtag={hashtag}
      totalSprayed={totalSprayed}
      sprayCount={sprayHistory.length}
      leaderboard={leaderboard}
      accentColor={accentColor}
    />
  )}

      <div className="sheet">
        <div className="sheet-inner">
          <div className="sheet-title">Spray History</div>
          {sprayHistory.map((tx, i) => {
            const c = COINS.find(x => x.symbol === tx.coin) || COINS[0];
            return (
              <div key={tx.hash + i} className="tx-item">
                <div className="tx-coin-badge" style={{ background: c.color + "20", color: c.color }}>
                  {c.glyph}
                </div>
                <div className="tx-info">
                  <div className="tx-name">Sprayed {c.name}</div>
                  <a className="tx-hash" href={tx.link} target="_blank" rel="noreferrer">
                    {tx.hash.slice(0, 22)}…
                  </a>
                  <div className="tx-time">{timeAgo(tx.timestamp)} · {tx.eventId}</div>
                </div>
                <div className="tx-amt">−{tx.amountXRP} XRP</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [eventName,   setEventName]   = useState("");
  const [hashtag,     setHashtag]     = useState("");
  const [accentColor, setAccentColor] = useState("#E9A228");
  const [eventWallet, setEventWallet] = useState("");
  const [screen, setScreen]           = useState(SCREENS.ONBOARD);
  const [displayName, setDisplayName] = useState("");
  const [eventCode, setEventCode]     = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const socketRef = useRef(null);
  const { wallet, isLoading, error, createWallet, refreshBalance, doSpray, sprayHistory, totalSprayed, spraySpeed, setSpraySpeed } = useXRPL();

  useEffect(() => {
    if (!wallet || !eventCode) return;
    const socket = io(BACKEND_URL, { transports: ["websocket"] });
    socketRef.current = socket;
    socket.on("connect",    () => setWsConnected(true));
    socket.on("disconnect", () => setWsConnected(false));
    socket.on("leaderboard_update", lb => setLeaderboard(lb));
    socket.emit("join_event", { eventId: eventCode, address: wallet.address });
    return () => socket.disconnect();
  }, [wallet, eventCode]);

  async function fetchEventMeta(code) {
  if (!code || code.length < 4) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/events/${code}`);
    if (res.ok) {
      const data = await res.json();
      setEventMeta({
        name:        data.name        || code,
        hashtag:     data.hashtag     || "",
        accentColor: data.accentColor || "#E9A228",
      });
      setEventWallet(data.walletAddress || data.host || "");
    }
  } catch (_) {}
}

  async function handleOnboard({ displayName: dn, eventCode: ec }) {
    setDisplayName(dn);
    setEventCode(ec);
    await fetchEventMeta(ec);
    await createWallet();
    triggerConfetti();
    setScreen(SCREENS.WALLET);
  }

  async function handleSpray(opts) {
    const entry = await doSpray(opts);
    if (socketRef.current?.connected) {
      socketRef.current.emit("spray", {
        eventId: eventCode, displayName, coin: opts.coin,
        amountXRP: SPRAY_COST_AMOUNT, hash: entry.hash, timestamp: entry.timestamp,
      });
    }
    return entry;
  }

  const hasWallet = !!wallet;

  return (
    <>
      <style>{CSS}</style>
      <div>
        <header className="os-header">
          <div className="os-logo">
            <span className="os-logo-oya gold-shimmer">Oya</span>
            <span className="os-logo-spray"> Spray</span>
          </div>
          {wallet && eventCode && <div className="os-event-pill">{eventCode}</div>}
        </header>

        {screen === SCREENS.ONBOARD && <OnboardScreen onDone={handleOnboard} isLoading={isLoading} error={error} />}
        {screen === SCREENS.WALLET  && <WalletScreen wallet={wallet} isLoading={isLoading} refreshBalance={refreshBalance} wsConnected={wsConnected} displayName={displayName} eventWallet={eventWallet}/>}
        {screen === SCREENS.SPRAY && <SprayScreen wallet={wallet} doSpray={handleSpray} isLoading={isLoading} error={error} totalSprayed={totalSprayed} displayName={displayName} eventCode={eventCode} spraySpeed={spraySpeed} setSpraySpeed={setSpraySpeed} />}
       {screen === SCREENS.HISTORY && (
  <HistoryScreen
    sprayHistory={sprayHistory}
    totalSprayed={totalSprayed}
    displayName={displayName}
    eventCode={eventCode}
    eventName={eventName}
    hashtag={hashtag}
    leaderboard={leaderboard}
    accentColor={accentColor}
  />
)}


        {hasWallet && (
          <nav className="os-nav">
            {[
              { id: SCREENS.WALLET,  label: "Wallet",  icon: "💳" },
              { id: SCREENS.SPRAY,   label: "Spray",   icon: "🎊" },
              { id: SCREENS.HISTORY, label: "History", icon: "📜" },
            ].map(({ id, label, icon }) => (
              <button key={id} className={`nav-item ${screen === id ? "active" : ""}`} onClick={() => setScreen(id)}>
                <span className="nav-icon">{icon}</span>
                <span className="nav-label">{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}
