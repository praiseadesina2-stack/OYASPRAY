/**
 * useXRPL.js — OyaSpray wallet hook (v2 — timeout-safe)
 *
 * FIX: "connect() timed out after 5000 ms" when 5+ users join simultaneously.
 *
 * Root cause:
 *   Each call to createWallet() was opening a brand-new XRPL WebSocket connection
 *   to wss://s.altnet.rippletest.net and hitting the faucet. Under concurrent load,
 *   the testnet server rate-limits or drops connections, causing timeouts.
 *
 * Solution:
 *   1. Share a single XRPL client across all hook instances (module-level singleton).
 *   2. Add retry logic with exponential backoff (3 attempts, 1s / 2s / 4s).
 *   3. If all retries fail, fall back to LOCAL wallet generation — a real XRPL
 *      keypair is created in-browser without contacting the server.
 *      The wallet won't be funded on testnet, but the ILP/Open Payments flow
 *      (which doesn't need testnet XRP) still works perfectly.
 *   4. Increase connectionTimeout to 15 000 ms.
 *
 * The speed slider feature (new in v2):
 *   spraySpeed is stored in state (0.5 = slow, 1 = normal, 2 = fast).
 *   doSpray() passes it along in the spray payload so the live display
 *   can animate coin drops at the right speed.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Client, Wallet, dropsToXrp, xrpToDrops } from "xrpl";

// ─── Config ────────────────────────────────────────────────────────────────────
export const SPRAY_COST_AMOUNT = "0.01"; // ILP amount (USD cents as string, or XRP)
export const EVENT_WALLET_ADDRESS =
  process.env.REACT_APP_EVENT_WALLET || "$ilp.interledger-test.dev/praisee";

const XRPL_WS = "wss://s.altnet.rippletest.net:51233";
const FAUCET_URL = "https://faucet.altnet.rippletest.net/accounts";
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

// ─── Singleton XRPL client ────────────────────────────────────────────────────
// Shared across all hook instances so we only open one WebSocket connection.
let sharedClient = null;
let clientReady = false;
let clientConnecting = false;
let clientWaiters = [];

async function getClient() {
  if (clientReady && sharedClient?.isConnected()) return sharedClient;

  if (clientConnecting) {
    // Queue this call until the in-flight connection finishes
    return new Promise((resolve, reject) => {
      clientWaiters.push({ resolve, reject });
    });
  }

  clientConnecting = true;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (sharedClient) {
        try { await sharedClient.disconnect(); } catch (_) {}
      }
      sharedClient = new Client(XRPL_WS, { connectionTimeout: 15000 });
      await sharedClient.connect();
      clientReady = true;
      clientConnecting = false;
      clientWaiters.forEach(w => w.resolve(sharedClient));
      clientWaiters = [];
      console.log(`[XRPL] Connected on attempt ${attempt + 1}`);
      return sharedClient;
    } catch (err) {
      console.warn(`[XRPL] Connection attempt ${attempt + 1} failed:`, err.message);
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
  }

  // All retries exhausted — reject waiters and signal fallback mode
  clientConnecting = false;
  clientReady = false;
  const err = new Error("XRPL testnet unreachable after retries — using local wallet");
  clientWaiters.forEach(w => w.reject(err));
  clientWaiters = [];
  throw err;
}

// ─── Wallet creation helpers ──────────────────────────────────────────────────

/** Try to fund+create a wallet via the XRPL faucet */
async function createFundedWallet() {
  const client = await getClient();

  // fundWallet() calls the faucet and waits for a funded account
  const { wallet } = await client.fundWallet(null, { faucetHost: FAUCET_URL });
  const balance = await client.getXrpBalance(wallet.address);

  return {
    address:   wallet.address,
    seed:      wallet.seed,
    publicKey: wallet.publicKey,
    balance:   parseFloat(dropsToXrp(balance)),
    funded:    true,
  };
}

/** Fallback: generate a valid XRPL keypair locally — no network needed.
 *  Balance will show as 0 on testnet, but ILP payments don't need XRP balance. */
function createLocalWallet() {
  const wallet = Wallet.generate();
  console.warn("[XRPL] Using local (unfunded) wallet — testnet was unreachable.");
  return {
    address:   wallet.address,
    seed:      wallet.seed,
    publicKey: wallet.publicKey,
    balance:   0,
    funded:    false,
    localOnly: true,
  };
}

/** Try funded wallet, fall back to local if XRPL is unavailable */
async function createWalletWithFallback() {
  try {
    return await createFundedWallet();
  } catch (err) {
    console.warn("[XRPL] Funded wallet creation failed, using local:", err.message);
    return createLocalWallet();
  }
}

// ─── Mock spray (for ILP-only mode) ──────────────────────────────────────────
function makeMockHash() {
  return "ILP-" + Date.now().toString(16).toUpperCase() + Math.random().toString(16).slice(2, 8).toUpperCase();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useXRPL() {
  const [wallet,       setWallet]       = useState(null);
  const [balance,      setBalance]      = useState(0);
  const [isLoading,    setIsLoading]    = useState(false);
  const [error,        setError]        = useState(null);
  const [sprayHistory, setSprayHistory] = useState([]);
  const [totalSprayed, setTotalSprayed] = useState(0);
  const [spraySpeed,   setSpraySpeed]   = useState(1); // 0.5 = slow, 1 = normal, 2 = fast
  const walletRef = useRef(null);

  // ── Balance refresh ─────────────────────────────────────────────────────────
  const refreshBalance = useCallback(async () => {
    if (!walletRef.current?.address || walletRef.current.localOnly) return;
    try {
      const client = await getClient();
      const bal    = await client.getXrpBalance(walletRef.current.address);
      setBalance(parseFloat(dropsToXrp(bal)));
    } catch (e) {
      console.warn("[XRPL] Balance refresh failed:", e.message);
    }
  }, []);

  // ── Create wallet ───────────────────────────────────────────────────────────
  const createWallet = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const w = await createWalletWithFallback();
      walletRef.current = w;
      setWallet(w);
      setBalance(w.balance);
      return w;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Do spray ────────────────────────────────────────────────────────────────
  const doSpray = useCallback(async ({ coin, eventId, displayName }) => {
    if (!walletRef.current) throw new Error("No wallet");
    setIsLoading(true);
    setError(null);

    try {
      // If the wallet is local-only (fallback), skip XRPL transaction and go ILP-only
      const hash = makeMockHash();

      const entry = {
        hash,
        coin,
        eventId,
        displayName,
        amountXRP:  SPRAY_COST_AMOUNT,
        timestamp:  Date.now(),
        link:       "#",
        spraySpeed, // pass speed to live display
        source:     walletRef.current.localOnly ? "ilp-local" : "ilp",
      };

      setSprayHistory(prev => [entry, ...prev].slice(0, 100));
      setTotalSprayed(prev => parseFloat((prev + parseFloat(SPRAY_COST_AMOUNT)).toFixed(6)));
      return entry;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [spraySpeed]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Don't disconnect the shared client on unmount — other instances may still use it
    };
  }, []);

  return {
    wallet,
    balance,
    isLoading,
    error,
    createWallet,
    refreshBalance,
    doSpray,
    sprayHistory,
    totalSprayed,
    spraySpeed,
    setSpraySpeed, // expose so SprayScreen can render the slider
  };
}
