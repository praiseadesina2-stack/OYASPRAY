/**
 * xrplService.js
 * Handles all XRPL Testnet interactions for DoingsMachine.
 *
 * Uses the XRPL Testnet (wss://s.altnet.rippletest.net:51233)
 * Faucet: https://faucet.altnet.rippletest.net/accounts
 *
 * Flow:
 *  1. generateWallet()  → creates a fresh testnet wallet + funds it via faucet
 *  2. getBalance()      → fetches live XRP drops balance
 *  3. spray()           → sends a Payment transaction to the event's destination address
 *  4. subscribeToAccount() → listens for incoming txns on the event wallet (for live screen)
 */

import { Client, Wallet, xrpToDrops, dropsToXrp } from "xrpl";

// ─── Testnet config ───────────────────────────────────────────────────────────
const TESTNET_WSS = "wss://s.altnet.rippletest.net:51233";
const FAUCET_URL  = "https://faucet.altnet.rippletest.net/accounts";

// DoingsMachine event wallet on testnet (replace with your actual funded address)
// This is where all sprayed XRP accumulates during the event.
export const EVENT_WALLET_ADDRESS = "$ilp.interledger-test.dev/praisee"; // example testnet addr

// Cost per spray in AMOUNT (1 = 10,000 drops)
export const SPRAY_COST_AMOUNT = "1"; // 1 unit in the testnet currency

// ─── Singleton client ─────────────────────────────────────────────────────────
let _client = null;

async function getClient() {
  if (_client && _client.isConnected()) return _client;
  _client = new Client(TESTNET_WSS);
  await _client.connect();
  console.log("[XRPL] Connected to testnet:", TESTNET_WSS);
  return _client;
}

export async function disconnectClient() {
  if (_client && _client.isConnected()) {
    await _client.disconnect();
    _client = null;
  }
}

// ─── Wallet generation ────────────────────────────────────────────────────────
/**
 * generateWallet()
 * Creates a new XRPL testnet wallet and funds it via the testnet faucet.
 * Returns { wallet, balance } where balance is in XRP (string).
 *
 * NOTE: On testnet the faucet gives ~100 XRP for free.
 */
export async function generateWallet() {
  const client = await getClient();

  // fundWallet() hits the faucet automatically on testnet
  const { wallet, balance } = await client.fundWallet();

  console.log("[XRPL] New wallet funded:");
  console.log("  Address:", wallet.address);
  console.log("  Seed:   ", wallet.seed);
  console.log("  Balance:", balance, "XRP");

  return {
    address: wallet.address,
    seed:    wallet.seed,         // store securely! used to sign txns
    balance: String(balance),
  };
}

// ─── Balance ─────────────────────────────────────────────────────────────────
/**
 * getBalance(address)
 * Returns the current balance in XRP for a given address.
 */
export async function getBalance(address) {
  try {
    const client = await getClient();
    const response = await client.request({
      command: "account_info",
      account: address,
      ledger_index: "validated",
    });
    const drops = response.result.account_data.Balance;
    return dropsToXrp(drops); // returns string e.g. "99.999988"
  } catch (err) {
    if (err.message?.includes("actNotFound")) return "0";
    throw err;
  }
}

// ─── Spray (Payment) ─────────────────────────────────────────────────────────
/**
 * spray({ seed, destination, amountXRP, memoTag })
 *
 * Sends amountXRP from the sprayer's wallet to the event wallet.
 * Uses a memo to embed: sprayer display name + coin label + event ID.
 *
 * Returns the tx hash on success.
 */
export async function spray({ seed, destination, amountXRP, memoData }) {
  // If destination is an ILP payment pointer (starts with $),
  // skip XRPL and return a mock hash for testing
  if (destination.startsWith("$")) {
    const mockHash = "ILP-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    console.log("[ILP] Spray recorded (ILP mode):", mockHash, memoData);
    return mockHash;
  }

  // XRPL path (only used if destination is a real r-address)
  const client = await getClient();
  const wallet = Wallet.fromSeed(seed);

  const toHex = (str) =>
    Buffer.from(str, "utf8").toString("hex").toUpperCase();

  const tx = {
    TransactionType: "Payment",
    Account:         wallet.address,
    Amount:          xrpToDrops(amountXRP),
    Destination:     destination,
    Memos: [
      {
        Memo: {
          MemoType: toHex("doingsmachine/spray"),
          MemoData: toHex(JSON.stringify(memoData)),
        },
      },
    ],
  };

  const prepared = await client.autofill(tx);
  const signed   = wallet.sign(prepared);
  const result   = await client.submitAndWait(signed.tx_blob);

  const outcome = result.result.meta.TransactionResult;
  if (outcome !== "tesSUCCESS") {
    throw new Error(`Transaction failed: ${outcome}`);
  }

  const hash = result.result.hash;
  console.log("[XRPL] Spray sent! Hash:", hash);
  return hash;
}
// ─── Account subscription ─────────────────────────────────────────────────────
/**
 * subscribeToAccount(address, onPayment)
 * Subscribes to ledger events on `address`.
 * Calls onPayment({ from, amountXRP, memoData, hash }) on each incoming Payment.
 */
export async function subscribeToAccount(address, onPayment) {
  const client = await getClient();

  await client.request({
    command:  "subscribe",
    accounts: [address],
  });

  client.on("transaction", (event) => {
    const tx = event.transaction;
    if (
      tx.TransactionType === "Payment" &&
      tx.Destination     === address   &&
      event.meta?.TransactionResult === "tesSUCCESS"
    ) {
      let memoData = {};
      try {
        const rawMemo = tx.Memos?.[0]?.Memo?.MemoData;
        if (rawMemo) {
          memoData = JSON.parse(
            Buffer.from(rawMemo, "hex").toString("utf8")
          );
        }
      } catch (_) {}

      onPayment({
        from:      tx.Account,
        amountXRP: dropsToXrp(tx.Amount),
        memoData,
        hash:      tx.hash,
      });
    }
  });

  console.log("[XRPL] Subscribed to account:", address);
}

// ─── Testnet explorer URL ─────────────────────────────────────────────────────
export function explorerUrl(hash) {
  return `https://testnet.xrpl.org/transactions/${hash}`;
}
