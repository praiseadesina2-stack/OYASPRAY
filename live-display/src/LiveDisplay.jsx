/**
 * LiveDisplay.jsx — OyaSpray Big Screen v2
 *
 * NEW in v2:
 *  - Create Event landing page (event owner flow):
 *    • ILP wallet address input → money drops here
 *    • Auto-generated event code (e.g. OYA-7K3M)
 *    • Event hashtag (e.g. #OBIEMA26)
 *    • Event color picker → entire live display themes to that color
 *    • Creates the event on the backend via POST /api/events
 *  - Sprayers who join see: hashtag + event color theming
 *  - Speed slider on sprayer side (passed via spray payload, reflected in coin fall speed)
 *  - Live display themes dynamically to the event's color
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:4000";

// ─── Coin registry ────────────────────────────────────────────────────────────
const COIN_COLORS = {
  XRP:  "#00AAE4", BTC: "#F7931A", ETH: "#627EEA",
  USDT: "#26A17B", ADA: "#0033AD", SOL: "#9945FF",
  NGN:  "#00A859", USD: "#1D9E75", GBP: "#8B4FBE", EUR: "#1060C0",
};
const coinColor = (s) => COIN_COLORS[s] || "#E9A228";

// ─── Event code generator ─────────────────────────────────────────────────────
function generateEventCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "OYA-";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── Hex → RGB ────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// ─── CSS builder (dynamic theming) ───────────────────────────────────────────
function buildCSS(accentHex = "#E9A228") {
  const rgb = hexToRgb(accentHex);
  return `
  @import url('https://api.fontshare.com/v2/css?f[]=clash-display@700,800&f[]=satoshi@400,500,600&f[]=cabinet-grotesk@700,800&f[]=jet-brains-mono@400,500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --accent:     ${accentHex};
    --accent-rgb: ${rgb};
    --accent-lt:  color-mix(in srgb, ${accentHex} 70%, white);
    --accent-dk:  color-mix(in srgb, ${accentHex} 70%, black);
    --bg:         #050200;
    --surface:    #0D0601;
    --card:       #120800;
    --border:     rgba(${rgb}, 0.18);
    --text:       #F5E6C8;
    --text-dim:   rgba(245,230,200,0.4);
    --green:      #1D9E75;
    --red:        #D85A30;
  }

  html, body, #root {
    width: 100vw; height: 100vh;
    background: var(--bg);
    overflow: hidden;
    font-family: 'Satoshi', sans-serif;
    color: var(--text);
    zoom: 0.951;
  }

  /* ─── Shimmer ─────────────────────────────────────────── */
  @keyframes shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  .shimmer {
    background: linear-gradient(90deg, var(--accent-dk) 0%, var(--accent) 40%, var(--accent-lt) 50%, var(--accent) 60%, var(--accent-dk) 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer 3s linear infinite;
  }

  /* ─── Stage layout ────────────────────────────────────── */
  .stage {
    width: 100vw; height: 100vh;
    display: grid;
    grid-template-columns: 1fr 360px;
    grid-template-rows: auto 1fr auto;
    position: relative;
    background: radial-gradient(ellipse at 50% 0%, rgba(${rgb},0.06) 0%, transparent 55%);
  }

  /* ─── Header ──────────────────────────────────────────── */
  .stage-header {
    grid-column: 1 / -1;
    display: flex; align-items: center; justify-content: space-between;
    padding: 1.25rem 2.5rem 1rem;
    border-bottom: 0.5px solid var(--border);
    background: rgba(5,2,0,0.96);
    backdrop-filter: blur(10px);
    z-index: 20;
    overflow: visible;
  }
  .logo {
    font-family: 'Clash Display', sans-serif;
    font-size: 26px; font-weight: 800; letter-spacing: -0.5px;
    color: var(--accent);
  }
  .logo span { color: var(--text); }
  .event-info { text-align: center; }
  .event-name {
    font-family: 'Clash Display', sans-serif;
    font-size: 20px; font-weight: 800;
    color: var(--accent);
  }
  .event-hashtag {
    font-family: 'Clash Display', sans-serif;
    font-size: 13px; font-weight: 700;
    color: rgba(${rgb}, 0.6);
    letter-spacing: 1px; margin-top: 1px;
  }
  .event-code-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; letter-spacing: 2px;
    color: rgba(245,230,200,0.35);
    margin-top: 3px;
  }
  .live-pill {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 16px; border-radius: 24px;
    background: rgba(29,158,117,0.12);
    border: 0.5px solid rgba(29,158,117,0.3);
    font-size: 12px; font-weight: 600; color: #5DCAA5;
  }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #1D9E75; animation: blink 1.2s ease-in-out infinite; }
  .offline-dot { background: #D85A30; animation: blink 0.6s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: 0.2; } }

  /* ─── Rain area ───────────────────────────────────────── */
  .rain-area {
    grid-column: 1; grid-row: 2;
    position: relative; overflow: hidden;
  }
  .rain-empty {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 12px;
    font-family: 'Clash Display', sans-serif;
    font-size: 40px; font-weight: 800;
    color: rgba(${rgb}, 0.08);
    pointer-events: none;
  }
  .rain-empty-sub {
    font-family: 'Satoshi', sans-serif;
    font-size: 14px; font-weight: 500;
    color: rgba(${rgb}, 0.12);
    letter-spacing: 2px; text-transform: uppercase;
  }

  /* ─── Coin drop ───────────────────────────────────────── */
  .coin-drop {
    position: absolute; top: -90px;
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    animation: fallDown linear forwards;
    pointer-events: none;
  }
  @keyframes fallDown {
    0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
    80%  { opacity: 1; }
    100% { transform: translateY(108vh) rotate(720deg); opacity: 0; }
  }
  .coin-circle {
    width: 58px; height: 58px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Clash Display', sans-serif; font-size: 11px; font-weight: 800;
    border: 2px solid rgba(255,255,255,0.12);
    box-shadow: 0 0 24px rgba(255,255,255,0.06);
    animation: coinSpin linear infinite;
  }
  @keyframes coinSpin {
    0%   { transform: rotateY(0deg); }
    100% { transform: rotateY(360deg); }
  }
  .coin-banknote {
    width: 80px; height: 36px; border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Cabinet Grotesk', sans-serif; font-size: 13px; font-weight: 800;
    border: 1px solid rgba(255,255,255,0.1);
  }
  .coin-sprayer {
    font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.55);
    white-space: nowrap; background: rgba(0,0,0,0.45);
    padding: 2px 7px; border-radius: 6px;
  }

  /* ─── Spray flash ─────────────────────────────────────── */
  .spray-flash {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    text-align: center; pointer-events: none;
    animation: flashIn 2.8s ease-out forwards; z-index: 10;
  }
  @keyframes flashIn {
    0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
    12%  { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
    30%  { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    70%  { opacity: 1; }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.15); }
  }
  .flash-name {
    font-family: 'Clash Display', sans-serif;
    font-size: 72px; font-weight: 800; line-height: 1;
    color: var(--accent);
    text-shadow: 0 0 80px rgba(${rgb}, 0.7);
  }
  .flash-hashtag {
    font-family: 'Clash Display', sans-serif;
    font-size: 20px; font-weight: 700;
    color: rgba(${rgb}, 0.7); margin-top: 4px;
  }
  .flash-action { font-size: 16px; color: rgba(245,230,200,0.5); margin-top: 6px; }

  /* ─── Pulse overlay ───────────────────────────────────── */
  .pulse-overlay {
    position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse at 50% 50%, rgba(${rgb}, 0.12) 0%, transparent 70%);
    animation: pulseFade 0.6s ease-out forwards;
    z-index: 5;
  }
  @keyframes pulseFade { 0% { opacity: 1; } 100% { opacity: 0; } }

  /* ─── Sidebar ─────────────────────────────────────────── */
  .sidebar {
    grid-column: 2; grid-row: 2 / 4;
    border-left: 0.5px solid var(--border);
    background: rgba(10,5,0,0.94);
    display: flex; flex-direction: column;
    padding: 1.5rem; gap: 1.5rem; overflow: hidden;
  }
  .sidebar-title {
    font-size: 9px; font-weight: 700;
    letter-spacing: 1.8px; text-transform: uppercase;
    color: rgba(${rgb}, 0.4); margin-bottom: 0.75rem;
  }

  /* ─── Leaderboard ─────────────────────────────────────── */
  .leader-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 11px; border-radius: 12px; margin-bottom: 5px;
    background: rgba(${rgb}, 0.05);
    border: 0.5px solid rgba(${rgb}, 0.1);
    transition: all 0.4s ease;
    animation: slideIn 0.3s ease;
  }
  .leader-row.top1 {
    background: rgba(${rgb}, 0.1);
    border-color: rgba(${rgb}, 0.25);
    box-shadow: 0 0 20px rgba(${rgb}, 0.08);
  }
  @keyframes slideIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
  .leader-rank {
    font-family: 'Clash Display', sans-serif; font-size: 16px; font-weight: 800;
    color: rgba(${rgb}, 0.3); min-width: 26px; text-align: center;
  }
  .leader-rank.top { color: var(--accent); }
  .leader-crown { font-size: 14px; position: absolute; top: -10px; left: 50%; transform: translateX(-50%); animation: crownFloat 2s ease-in-out infinite; }
  @keyframes crownFloat { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-4px); } }
  .leader-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Clash Display', sans-serif; font-size: 12px; font-weight: 800;
    flex-shrink: 0; position: relative;
  }
  .leader-info { flex: 1; min-width: 0; }
  .leader-name { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .leader-bar-wrap { height: 2px; background: rgba(255,255,255,0.06); border-radius: 2px; margin-top: 5px; }
  .leader-bar { height: 2px; border-radius: 2px; transition: width 0.7s ease; }
  .leader-total { font-family: 'Cabinet Grotesk', sans-serif; font-size: 12px; font-weight: 800; white-space: nowrap; }

  /* ─── Live feed ───────────────────────────────────────── */
  .feed-wrap { flex: 1; overflow: hidden; }
  .feed-item {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 0; border-bottom: 0.5px solid rgba(${rgb}, 0.07);
    animation: feedIn 0.2s ease;
    font-size: 12px;
  }
  @keyframes feedIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
  .feed-coin {
    width: 26px; height: 26px; border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    font-size: 8px; font-weight: 800; flex-shrink: 0;
  }
  .feed-name { font-weight: 600; color: var(--text); flex: 1; min-width: 0; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
  .feed-amt { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-dim); }
  .feed-check { font-size: 9px; color: #1D9E75; }

  /* ─── Footer ──────────────────────────────────────────── */
  .stage-footer {
    grid-column: 1; grid-row: 3;
    padding: 0.7rem 2rem;
    display: flex; align-items: center; justify-content: space-between;
    border-top: 0.5px solid var(--border);
    background: rgba(5,2,0,0.92);
    font-size: 11px; color: var(--text-dim);
  }
  .footer-total {
    font-family: 'Clash Display', sans-serif;
    font-size: 20px; font-weight: 800; color: var(--accent);
    display: block;
  }
  .footer-total-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; display: block; color: rgba(${rgb},0.4); }

  /* ─── Milestone flash ─────────────────────────────────── */
  .milestone-banner {
    position: absolute; top: 0; left: 0; right: 0;
    background: linear-gradient(135deg, rgba(${rgb},0.15), rgba(${rgb},0.08));
    border-bottom: 1px solid rgba(${rgb},0.3);
    padding: 12px; text-align: center; z-index: 15;
    animation: milestoneIn 3s ease-out forwards;
  }
  @keyframes milestoneIn {
    0%   { transform: translateY(-100%); opacity: 0; }
    10%  { transform: translateY(0); opacity: 1; }
    80%  { transform: translateY(0); opacity: 1; }
    100% { transform: translateY(-100%); opacity: 0; }
  }
  .milestone-text {
    font-family: 'Clash Display', sans-serif; font-size: 18px; font-weight: 800; color: var(--accent);
  }

  /* ════════════════════════════════════════════════════════
     CREATE EVENT LANDING
  ════════════════════════════════════════════════════════ */
  .landing {
    position: fixed; inset: 0;
    background: #050200;
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
    overflow-y: auto;
    padding: 2rem 1rem;
  }
  .landing-bg {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(ellipse at 20% 20%, rgba(233,162,40,0.06) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 80%, rgba(233,162,40,0.04) 0%, transparent 50%);
  }
  .landing-inner {
    position: relative; z-index: 1;
    width: 100%; max-width: 560px;
    overflow: visible;
  }
  .landing-hero { text-align: center; margin-bottom: 2.5rem; overflow: visible;}
  .landing-logo {
    font-family: 'Clash Display', sans-serif;
    font-size: 48px; font-weight: 800; letter-spacing: -2px;
    color: #E9A228;
  }
  .landing-logo span { color: var(--text); }
  .landing-tagline {
    font-size: 15px; color: rgba(245,230,200,0.45);
    margin-top: 8px; line-height: 1.6;
  }

  .landing-tabs {
    display: flex; gap: 0; border-radius: 14px; overflow: hidden;
    border: 0.5px solid rgba(233,162,40,0.18);
    margin-bottom: 1.5rem; background: #0D0601;
  }
  .landing-tab {
    flex: 1; padding: 12px; text-align: center; cursor: pointer;
    font-family: 'Clash Display', sans-serif; font-size: 13px; font-weight: 700;
    color: rgba(245,230,200,0.35);
    background: none; border: none;
    transition: all 0.2s; letter-spacing: 0.5px;
  }
  .landing-tab.active {
    background: rgba(233,162,40,0.1);
    color: #E9A228;
    border-bottom: 2px solid #E9A228;
  }

  .landing-card {
    background: #120800;
    border: 0.5px solid rgba(233,162,40,0.18);
    border-radius: 20px; padding: 2rem;
  }
  .form-section { margin-bottom: 1.5rem; }
  .form-label {
    font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
    text-transform: uppercase; color: rgba(245,230,200,0.4);
    margin-bottom: 0.5rem; display: block;
  }
  .form-input {
    width: 100%; background: #080400;
    border: 0.5px solid rgba(233,162,40,0.18); border-radius: 12px;
    padding: 13px 15px; color: var(--text);
    font-family: 'Satoshi', sans-serif; font-size: 15px; font-weight: 500;
    outline: none; transition: border-color 0.15s;
  }
  .form-input:focus { border-color: #E9A228; }
  .form-input::placeholder { color: rgba(245,230,200,0.2); }
  .form-input.mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px; letter-spacing: 1px;
  }

  .code-display {
    background: #080400; border: 0.5px solid rgba(233,162,40,0.25);
    border-radius: 12px; padding: 14px 16px;
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 0;
  }
  .code-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 22px; font-weight: 700; letter-spacing: 3px; color: #E9A228;
  }
  .code-copy {
    background: rgba(233,162,40,0.1); border: 0.5px solid rgba(233,162,40,0.25);
    border-radius: 8px; padding: 6px 12px; cursor: pointer;
    font-size: 11px; font-weight: 700; color: #E9A228;
    font-family: 'Satoshi', sans-serif;
    transition: background 0.15s;
  }
  .code-copy:hover { background: rgba(233,162,40,0.18); }

  .color-swatches {
    display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px;
  }
  .color-swatch {
    width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
    border: 2px solid transparent; transition: all 0.15s;
    flex-shrink: 0;
  }
  .color-swatch.selected { border-color: white; box-shadow: 0 0 0 3px rgba(255,255,255,0.2); transform: scale(1.1); }
  .color-custom-wrap { display: flex; align-items: center; gap: 8px; }
  .color-hex-input {
    background: #080400; border: 0.5px solid rgba(233,162,40,0.18);
    border-radius: 8px; padding: 8px 12px;
    color: var(--text); font-family: 'JetBrains Mono', monospace;
    font-size: 13px; outline: none; width: 110px;
    transition: border-color 0.15s;
  }
  .color-hex-input:focus { border-color: #E9A228; }

  .info-box {
    background: rgba(0,170,228,0.06); border: 0.5px solid rgba(0,170,228,0.2);
    border-radius: 10px; padding: 12px 14px;
    font-size: 12px; color: rgba(0,170,228,0.7); line-height: 1.6;
    margin-bottom: 1.5rem;
  }
  .info-box strong { color: #00AAE4; }

  .btn-create {
    width: 100%; padding: 15px;
    border-radius: 12px; border: none;
    background: linear-gradient(135deg, #C97D10, #E9A228, #FAC75A);
    background-size: 200% auto;
    color: #1A0A00; font-family: 'Clash Display', sans-serif;
    font-size: 16px; font-weight: 800; cursor: pointer;
    transition: all 0.2s; animation: shimmer 3s linear infinite;
  }
  .btn-create:hover { filter: brightness(1.08); }
  .btn-create:disabled { opacity: 0.4; cursor: not-allowed; animation: none; background: #E9A228; }

  .join-form { display: flex; flex-direction: column; gap: 1rem; }
  .btn-join {
    width: 100%; padding: 14px; border-radius: 12px; border: none;
    background: rgba(233,162,40,0.12);
    border: 0.5px solid rgba(233,162,40,0.3);
    color: #E9A228; font-family: 'Clash Display', sans-serif;
    font-size: 15px; font-weight: 800; cursor: pointer;
    transition: all 0.15s;
  }
  .btn-join:hover { background: rgba(233,162,40,0.2); }
  .btn-join:disabled { opacity: 0.4; cursor: not-allowed; }

  .success-box {
    background: rgba(29,158,117,0.08); border: 0.5px solid rgba(29,158,117,0.25);
    border-radius: 12px; padding: 16px; margin-bottom: 1.25rem;
    text-align: center;
  }
  .success-icon { font-size: 28px; margin-bottom: 6px; }
  .success-title { font-family: 'Clash Display', sans-serif; font-size: 16px; font-weight: 800; color: #5DCAA5; }
  .success-sub { font-size: 12px; color: rgba(245,230,200,0.45); margin-top: 4px; }

  /* ─── Speed QR hint ───────────────────────────────────── */
  .join-hint {
    margin-top: 1.5rem; text-align: center;
    font-size: 12px; color: rgba(245,230,200,0.25); line-height: 1.6;
  }
  .join-hint strong { color: rgba(245,230,200,0.5); }
`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
let dropId  = 0;
let flashId = 0;

const AVATAR_COLORS = ["#E9A228","#00AAE4","#1D9E75","#9945FF","#D85A30","#F7931A","#627EEA","#00A859"];
const avatarColor = (name) => AVATAR_COLORS[(name || "?").charCodeAt(0) % AVATAR_COLORS.length];
const initials    = (name) => (name || "??").slice(0, 2).toUpperCase();

const MILESTONE_AMOUNTS = [1, 5, 10, 25, 50, 100];
const PRESET_COLORS = [
  "#E9A228", // gold (default)
  "#00AAE4", // XRP blue
  "#F7931A", // Bitcoin orange
  "#9945FF", // Solana purple
  "#00A859", // Naira green
  "#D85A30", // sunset red
  "#1D9E75", // emerald
  "#627EEA", // Ethereum
  "#E91E8C", // hot pink
  "#00D4FF", // cyan
];

// ─── CoinDrop ─────────────────────────────────────────────────────────────────
function CoinDrop({ drop, onDone }) {
  const isFiat = ["NGN","USD","GBP","EUR"].includes(drop.coin);
  const dur    = drop.duration + "s";
  const spinDur = (drop.duration * 0.4) + "s";

  return (
    <div className="coin-drop" style={{ left: drop.x + "%", animationDuration: dur }} onAnimationEnd={onDone}>
      {isFiat ? (
        <div className="coin-banknote" style={{
          background: `linear-gradient(135deg, ${drop.color}33, ${drop.color}18)`,
          color: drop.color, borderColor: drop.color + "40",
        }}>
          {drop.coin}
        </div>
      ) : (
        <div className="coin-circle" style={{
          background: drop.color + "22", color: drop.color,
          borderColor: drop.color + "44", animationDuration: spinDur,
        }}>
          {drop.coin}
        </div>
      )}
      <div className="coin-sprayer">{drop.name}</div>
    </div>
  );
}

// ─── SprayFlash ───────────────────────────────────────────────────────────────
function SprayFlash({ flash, onDone }) {
  return (
    <div className="spray-flash" onAnimationEnd={onDone}>
      <div className="flash-name">{flash.name}</div>
      {flash.hashtag && <div className="flash-hashtag">{flash.hashtag}</div>}
      <div className="flash-action">sprayed {flash.coin} 🎉</div>
    </div>
  );
}

// ─── PulseOverlay ─────────────────────────────────────────────────────────────
function PulseOverlay({ id, onDone }) {
  return <div key={id} className="pulse-overlay" onAnimationEnd={onDone} />;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
function Leaderboard({ entries, accentHex }) {
  const max = entries[0]?.total || 1;
  return (
    <div>
      <div className="sidebar-title">Leaderboard 🏆</div>
      {entries.slice(0, 7).map((e, i) => {
        const color = coinColor(e.coin);
        const pct   = Math.round((e.total / max) * 100);
        return (
          <div key={e.name} className={`leader-row ${i === 0 ? "top1" : ""}`}>
            <div className={`leader-rank ${i < 3 ? "top" : ""}`}>
              {i === 0 ? "👑" : `#${i + 1}`}
            </div>
            <div className="leader-avatar" style={{ background: avatarColor(e.name) + "22", color: avatarColor(e.name) }}>
              {initials(e.name)}
            </div>
            <div className="leader-info">
              <div className="leader-name">{e.name}</div>
              <div className="leader-bar-wrap">
                <div className="leader-bar" style={{ width: pct + "%", background: color }} />
              </div>
            </div>
            <div className="leader-total" style={{ color }}>{e.total.toFixed(3)}</div>
          </div>
        );
      })}
      {entries.length === 0 && (
        <div style={{ color: "rgba(245,230,200,0.15)", fontSize: 12, textAlign: "center", padding: "1.5rem" }}>
          Waiting for the first spray…
        </div>
      )}
    </div>
  );
}

// ─── LiveFeed ─────────────────────────────────────────────────────────────────
function LiveFeed({ items }) {
  return (
    <div className="feed-wrap">
      <div className="sidebar-title">Live Feed ⚡</div>
      {items.slice(0, 14).map((tx, i) => {
        const color = coinColor(tx.coin);
        return (
          <div key={(tx.hash || tx.id || i) + i} className="feed-item">
            <div className="feed-coin" style={{ background: color + "22", color }}>
              {tx.coin.slice(0, 3)}
            </div>
            <div className="feed-name">{tx.displayName}</div>
            <div className="feed-amt">{tx.amountXRP}</div>
            {tx.confirmed && <div className="feed-check">✓</div>}
          </div>
        );
      })}
      {items.length === 0 && (
        <div style={{ color: "rgba(245,230,200,0.12)", fontSize: 12, textAlign: "center", padding: "1rem" }}>
          No sprays yet
        </div>
      )}
    </div>
  );
}

// ─── Create Event Form ────────────────────────────────────────────────────────
function CreateEventForm({ onCreated }) {
  const [walletAddress, setWalletAddress] = useState("");
  const [eventName,     setEventName]     = useState("");
  const [hashtag,       setHashtag]       = useState("");
  const [accentColor,   setAccentColor]   = useState("#E9A228");
  const [customHex,     setCustomHex]     = useState("");
  const [eventCode]                       = useState(generateEventCode);
  const [loading,       setLoading]       = useState(false);
  const [created,       setCreated]       = useState(false);
  const [error,         setError]         = useState("");
  const [copied,        setCopied]        = useState(false);

  function handleHashtagInput(val) {
    // auto-prefix with #, uppercase
    const clean = val.replace(/^#+/, "").toUpperCase().replace(/\s+/g, "");
    setHashtag(clean);
  }

  function handleColorSwatch(hex) {
    setAccentColor(hex);
    setCustomHex(hex);
  }

  function handleCustomHex(val) {
    setCustomHex(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) setAccentColor(val);
  }

  async function handleCreate() {
    if (!eventName.trim() || !walletAddress.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BACKEND_URL}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:           eventCode,
          name:         eventName.trim(),
          host:         walletAddress.trim(),
          hashtag:      hashtag ? "#" + hashtag : "",
          accentColor,
        }),
      });
      if (!res.ok) throw new Error("Server error " + res.status);
      setCreated(true);
    } catch (e) {
      setError("Could not reach the backend. Is it running? " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGoLive() {
    onCreated({
      eventId:    eventCode,
      eventName:  eventName.trim(),
      hashtag:    hashtag ? "#" + hashtag : "",
      accentColor,
      walletAddress,
    });
  }

  function copyCode() {
    navigator.clipboard.writeText(eventCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="landing-card">
      {/* Wallet */}
      <div className="form-section">
        <label className="form-label">Your ILP Wallet Address</label>
        <input
          className="form-input mono"
          placeholder="$ilp.interledger-test.dev/yourname"
          value={walletAddress}
          onChange={e => setWalletAddress(e.target.value)}
        />
        <div style={{ fontSize: 11, color: "rgba(245,230,200,0.25)", marginTop: 5 }}>
          All sprays will be routed to this wallet via Open Payments.
        </div>
      </div>

      {/* Event name */}
      <div className="form-section">
        <label className="form-label">Event Name</label>
        <input
          className="form-input"
          placeholder="Obi & Kelechi's Wedding"
          value={eventName}
          onChange={e => setEventName(e.target.value)}
        />
      </div>

      {/* Hashtag */}
      <div className="form-section">
        <label className="form-label">Event Hashtag</label>
        <div style={{ position: "relative" }}>
          <span style={{
            position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)",
            fontFamily: "'Clash Display', sans-serif", fontWeight: 800,
            fontSize: 16, color: accentColor, pointerEvents: "none",
          }}>#</span>
          <input
            className="form-input"
            style={{ paddingLeft: 28, fontFamily: "'Clash Display', sans-serif", fontWeight: 700, letterSpacing: 1 }}
            placeholder="OBIEMA26"
            value={hashtag}
            onChange={e => handleHashtagInput(e.target.value)}
          />
        </div>
        <div style={{ fontSize: 11, color: "rgba(245,230,200,0.25)", marginTop: 5 }}>
          Displayed on the live screen and the sprayers' phones.
        </div>
      </div>

      {/* Event color */}
      <div className="form-section">
        <label className="form-label">Event Color</label>
        <div className="color-swatches">
          {PRESET_COLORS.map(hex => (
            <div
              key={hex}
              className={`color-swatch ${accentColor === hex ? "selected" : ""}`}
              style={{ background: hex }}
              onClick={() => handleColorSwatch(hex)}
            />
          ))}
        </div>
        <div className="color-custom-wrap" style={{ marginTop: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: accentColor, border: "0.5px solid rgba(255,255,255,0.1)", flexShrink: 0 }} />
          <input
            className="color-hex-input"
            placeholder="#E9A228"
            value={customHex}
            onChange={e => handleCustomHex(e.target.value)}
          />
          <span style={{ fontSize: 11, color: "rgba(245,230,200,0.3)" }}>Custom hex</span>
        </div>
      </div>

      {/* Generated code */}
      <div className="form-section">
        <label className="form-label">Your Event Code</label>
        <div className="code-display">
          <div className="code-val">{eventCode}</div>
          <button className="code-copy" onClick={copyCode}>{copied ? "Copied!" : "Copy"}</button>
        </div>
        <div style={{ fontSize: 11, color: "rgba(245,230,200,0.25)", marginTop: 5 }}>
          Share this code with your guests so they can join on their phones.
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(216,90,48,0.1)", border: "0.5px solid rgba(216,90,48,0.3)", borderRadius: 10, padding: "10px 13px", fontSize: 12, color: "#D85A30", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {created && (
        <div className="success-box">
          <div className="success-icon">🎉</div>
          <div className="success-title">Event Created!</div>
          <div className="success-sub">Share code <strong style={{color:"#5DCAA5"}}>{eventCode}</strong> with your guests</div>
        </div>
      )}

      {!created ? (
        <button className="btn-create" onClick={handleCreate} disabled={loading || !eventName.trim() || !walletAddress.trim()}>
          {loading ? "Creating…" : "Create Event & Go Live →"}
        </button>
      ) : (
        <button className="btn-create" onClick={handleGoLive}>
          Launch Live Display →
        </button>
      )}

      <div className="join-hint">
        Guests open the <strong>Sprayer App</strong> and enter code <strong>{eventCode}</strong>.<br/>
        They'll automatically see <strong>{hashtag ? "#" + hashtag : "your hashtag"}</strong> and your event color.
      </div>
    </div>
  );
}

// ─── Join Event Form ──────────────────────────────────────────────────────────
function JoinEventForm({ onJoin }) {
  const [code, setCode] = useState(
    new URLSearchParams(window.location.search).get("event") || ""
  );

  return (
    <div className="landing-card join-form">
      <div className="info-box">
        <strong>Already have an event code?</strong><br/>
        Enter it below to connect this screen as a live display for that event.
      </div>
      <div>
        <label className="form-label">Event Code</label>
        <input
          className="form-input mono"
          placeholder="OYA-7K3M"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          style={{ textAlign: "center", letterSpacing: 3, fontSize: 22 }}
        />
      </div>
      <button
        className="btn-join"
        disabled={code.length < 4}
        onClick={() => onJoin({ eventId: code, eventName: code, hashtag: "", accentColor: "#E9A228" })}
      >
        Connect Screen →
      </button>
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
function LandingPage({ onJoin }) {
  const [tab, setTab] = useState("create"); // "create" | "join"

  return (
    <div className="landing">
      <div className="landing-bg" />
      <div className="landing-inner">
        <div className="landing-hero">
          <div className="landing-logo">Oya<span>Spray</span></div>
          <div className="landing-tagline">
            Digital money spraying for Nigerian events.<br />
            Real-time · Interledger · Make it rain.
          </div>
        </div>

        <div className="landing-tabs">
          <button className={`landing-tab ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}>
            🎉 Create Event
          </button>
          <button className={`landing-tab ${tab === "join" ? "active" : ""}`} onClick={() => setTab("join")}>
            📺 Join Existing
          </button>
        </div>

        {tab === "create" ? <CreateEventForm onCreated={onJoin} /> : <JoinEventForm onJoin={onJoin} />}
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function LiveDisplay() {
  const [eventId,     setEventId]     = useState(null);
  const [eventName,   setEventName]   = useState("OyaSpray Live");
  const [hashtag,     setHashtag]     = useState("");
  const [accentColor, setAccentColor] = useState("#E9A228");
  const [connected,   setConnected]   = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [feed,        setFeed]        = useState([]);
  const [drops,       setDrops]       = useState([]);
  const [flashes,     setFlashes]     = useState([]);
  const [pulses,      setPulses]      = useState([]);
  const [totalXRP,    setTotalXRP]    = useState(0);
  const [sprayCount,  setSprayCount]  = useState(0);
  const [milestone,   setMilestone]   = useState(null);
  const socketRef = useRef(null);
  const lastMilestoneRef = useRef(0);

  function joinEvent({ eventId: id, eventName: name, hashtag: ht, accentColor: color }) {
    setEventId(id);
    setEventName(name || id);
    setHashtag(ht || "");
    if (color) setAccentColor(color);

    const socket = io(BACKEND_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect",    () => {
      setConnected(true);
      socket.emit("join_event", { eventId: id });
    });
    socket.on("disconnect", () => setConnected(false));
    

    socket.on("leaderboard_update", lb => setLeaderboard(lb));

    socket.on("history", txns => {
      setFeed(txns);
      const total = txns.reduce((s, t) => s + parseFloat(t.amountXRP || 0), 0);
      setTotalXRP(total);
      setSprayCount(txns.length);
    });

    // Also check if backend sends event metadata (accentColor, hashtag)
    socket.on("event_meta", meta => {
      if (meta.accentColor) setAccentColor(meta.accentColor);
      if (meta.hashtag)     setHashtag(meta.hashtag);
      if (meta.name)        setEventName(meta.name);
    });

 
  // rest of code...

    const handleSpray = (tx) => {
       console.log("spray_rx:", tx.amountXRP, typeof tx.amountXRP);
      setFeed(prev => [tx, ...prev].slice(0, 50));
      setSprayCount(prev => prev + 1);
      
setTotalXRP(prev => {
  const newTotal = parseFloat((prev + parseFloat(tx.amountXRP || 0)).toFixed(6));

  const nextMilestone = MILESTONE_AMOUNTS.find(m => m > lastMilestoneRef.current && newTotal >= m);
  if (nextMilestone) {
    lastMilestoneRef.current = nextMilestone;
    setMilestone(`🎊 ${nextMilestone} XRP sprayed!`);
    setTimeout(() => setMilestone(null), 3500);
  }

  return newTotal;
});
      // Coin rain — speed from spray payload (default 3s, fast = 1.5s, slow = 5s)
      const spraySpeed = tx.spraySpeed || 1; // 0..2 range, 1 = normal
      const baseDur    = 4 / spraySpeed;
      const numDrops   = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < numDrops; i++) {
        setTimeout(() => {
          const id = ++dropId;
          setDrops(prev => [...prev, {
            id,
            x:        4 + Math.random() * 92,
            coin:     tx.coin,
            name:     tx.displayName,
            color:    coinColor(tx.coin),
            duration: baseDur - 0.5 + Math.random() * 1,
          }]);
        }, i * 110);
      }

      // Pulse background
      setPulses(prev => [...prev, { id: ++flashId }]);

      // Name flash (40% chance)
      if (Math.random() > 0.6) {
        const fid = ++flashId;
        setFlashes(prev => [...prev, { id: fid, name: tx.displayName, coin: tx.coin, hashtag }]);
      }
    };

    socket.on("spray_rx",        handleSpray);
    socket.on("spray_confirmed", handleSpray);
  }

  useEffect(() => {
    // Auto-join from URL
    const params = new URLSearchParams(window.location.search);
    const code   = params.get("event");
    if (code) joinEvent({ eventId: code, eventName: code, hashtag: "", accentColor: "#E9A228" });
    return () => socketRef.current?.disconnect();
  }, []);

  const removeDrop  = useCallback((id) => setDrops(p => p.filter(d => d.id !== id)),   []);
  const removeFlash = useCallback((id) => setFlashes(p => p.filter(f => f.id !== id)), []);
  const removePulse = useCallback((id) => setPulses(p => p.filter(x => x.id !== id)),  []);

  const css = buildCSS(accentColor);

  if (!eventId) {
    return (
      <>
        <style>{buildCSS("#E9A228")}</style>
        <LandingPage onJoin={joinEvent} />
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="stage">
        {/* Header */}
        <header className="stage-header">
          <div className="logo">Oya<span>Spray</span></div>
          <div className="event-info">
            <div className="event-name">{eventName}</div>
            {hashtag && <div className="event-hashtag">{hashtag}</div>}
            <div className="event-code-pill">{eventId}</div>
          </div>
          <div className="live-pill">
            <span className={`live-dot ${connected ? "" : "offline-dot"}`} />
            {connected ? "LIVE" : "CONNECTING…"}
          </div>
        </header>

        {/* Rain area */}
        <div className="rain-area">
          {/* Milestone banner */}
          {milestone && (
            <div className="milestone-banner">
              <div className="milestone-text">{milestone}</div>
            </div>
          )}

          {drops.map(d => <CoinDrop key={d.id} drop={d} onDone={() => removeDrop(d.id)} />)}
          {flashes.map(f => <SprayFlash key={f.id} flash={f} onDone={() => removeFlash(f.id)} />)}
          {pulses.map(p => <PulseOverlay key={p.id} id={p.id} onDone={() => removePulse(p.id)} />)}

          {drops.length === 0 && sprayCount === 0 && (
            <div className="rain-empty">
              WAITING FOR SPRAYS…
              <div className="rain-empty-sub">Share code {eventId} with guests</div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="sidebar">
          <Leaderboard entries={leaderboard} accentHex={accentColor} />
          <LiveFeed items={feed} />
        </aside>

        {/* Footer */}
        <footer className="stage-footer">
          <div>⚡ Interledger Testnet · {eventId}</div>
          <div style={{ textAlign: "center" }}>
            <span className="footer-total-label">Total Collected</span>
            <span className="footer-total">{totalXRP.toFixed(4)} XRP</span>
          </div>
          <div>{sprayCount} sprays · OyaSpray.io</div>
        </footer>
      </div>
    </>
  );
}
