/**
 * server.js — OyaSpray Backend
 *
 * Responsibilities:
 *  1. HTTP REST API  (Express)
 *     GET  /api/events/:id        → event summary + leaderboard
 *     POST /api/events            → create a new event
 *     GET  /api/events/:id/txns   → paginated transaction history
 *
 *  2. WebSocket (Socket.IO)
 *     Rooms keyed by eventId.
 *     Clients emit  "join_event" → backend puts them in the room
 *     Clients emit  "spray"      → backend validates + rebroadcasts
 *     Backend emits "spray_rx"   → to everyone in the room (including live screen)
 *     Backend emits "leaderboard_update" → after each spray
 *
 *  3. XRPL Testnet Listener
 *     Subscribes to the event wallet address on XRPL testnet.
 *     On each confirmed Payment, parses the DoingsMachine memo and
 *     broadcasts it to the matching Socket.IO room.
 *     This is the source of truth — even if the WebSocket client disconnects
 *     mid-spray, on-chain transactions are still captured.
 */

import "dotenv/config";
import express                from "express";
import http                   from "http";
import cors                   from "cors";
import { Server }             from "socket.io";
import { Client, dropsToXrp } from "xrpl";
import { createAuthenticatedClient, isPendingGrant } from "@interledger/open-payments";
import fs                     from "fs";
import path                   from "path";

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT               = process.env.PORT             || 4000;
const CORS_ORIGINS       = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",");
const ILP_WALLET_ADDRESS = process.env.ILP_WALLET_ADDRESS || "$ilp.interledger-test.dev/praisee";
const ILP_KEY_ID         = process.env.ILP_KEY_ID;
let ILP_PRIVATE_KEY;
if (process.env.ILP_PRIVATE_KEY_CONTENT) {
  // Used on Render — key content stored directly as env variable
  ILP_PRIVATE_KEY = process.env.ILP_PRIVATE_KEY_CONTENT.replace(/\\n/g, "\n");
} else {
  // Used locally — key loaded from file
  ILP_PRIVATE_KEY = fs.readFileSync(path.resolve(process.env.ILP_PRIVATE_KEY_PATH || "./private-key.pem"), "utf8");
}

// ─── Open Payments client ─────────────────────────────────────────────────────
let opClient = null;

async function getOPClient() {
  if (opClient) return opClient;
  opClient = await createAuthenticatedClient({
    walletAddressUrl: ILP_WALLET_ADDRESS.replace("$", "https://"),
    privateKey:       ILP_PRIVATE_KEY,
    keyId:            ILP_KEY_ID,
  });
  console.log("[ILP] Open Payments client ready");
  return opClient;
}

// ─── Create an incoming payment on your wallet ────────────────────────────────
async function createIncomingPayment(amountValue = "100") {
  try {
    const client       = await getOPClient();
    const walletUrl    = ILP_WALLET_ADDRESS.replace("$", "https://");
    const walletAddress = await client.walletAddress.get({ url: walletUrl });

    // Get a grant to create incoming payments
    const grant = await client.grant.request(
      { url: walletAddress.authServer },
      {
        access_token: {
          access: [
            {
              type:    "incoming-payment",
              actions: ["create", "read", "complete"],
            },
          ],
        },
      }
    );

    if (isPendingGrant(grant)) {
      console.warn("[ILP] Grant requires interaction — using mock mode");
      return null;
    }

    const incomingPayment = await client.incomingPayment.create(
      { url: walletAddress.resourceServer, accessToken: grant.access_token.value },
      {
        walletAddress:    walletUrl,
        incomingAmount:   { value: amountValue, assetCode: "USD", assetScale: 2 },
        expiresAt:        new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
      }
    );

    console.log("[ILP] Incoming payment created:", incomingPayment.id);
    return incomingPayment;
  } catch (err) {
    console.warn("[ILP] Could not create incoming payment:", err.message);
    return null;
  }
}
// ─── In-memory state (replace with a DB for production) ──────────────────────
/**
 * events: Map<eventId, {
 *   id, name, host, createdAt,
 *   transactions: SprayTx[],
 *   leaderboard:  Map<displayName, { total: float, coin: string, lastHash: string }>
 * }>
 *
 * SprayTx: { hash, from, displayName, coin, amountXRP, timestamp, source }
 */
const events = new Map();

function getOrCreateEvent(id) {
  if (!events.has(id)) {
    events.set(id, {
      id,
      name:         id,
      host:         "unknown",
      createdAt:    Date.now(),
      transactions: [],
      leaderboard:  new Map(),
    });
  }
  return events.get(id);
}

function recordSpray(eventId, spray) {
  const ev = getOrCreateEvent(eventId);
  ev.transactions.unshift(spray);

  // Update leaderboard
  const existing = ev.leaderboard.get(spray.displayName) || { total: 0, coin: spray.coin, lastHash: "" };
  existing.total    += parseFloat(spray.amountXRP);
  existing.coin      = spray.coin;
  existing.lastHash  = spray.hash;
  ev.leaderboard.set(spray.displayName, existing);

  return buildLeaderboard(ev);
}

function buildLeaderboard(ev) {
  return Array.from(ev.leaderboard.entries())
    .map(([name, data]) => ({ name, ...data, total: parseFloat(data.total.toFixed(6)) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json());

// Health check
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Create event
app.post("/api/events", (req, res) => {
  const { id, name, host, hashtag, accentColor } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });
  const ev = getOrCreateEvent(id);
  ev.name        = name || id;
  ev.host        = host || "unknown";
  ev.walletAddress = host || "unknown"; // host field already receives the wallet address
  ev.hashtag     = hashtag || "";
  ev.accentColor = accentColor || "#E9A228";
  res.json({ id:            ev.id,
  name:          ev.name,
  host:          ev.host,
  walletAddress: ev.walletAddress || ev.host, // add this line
  hashtag:       ev.hashtag     || "",
  accentColor:   ev.accentColor || "#E9A228",
  createdAt:     ev.createdAt,
  txCount:       ev.transactions.length,
  totalXRP:      ev.transactions.reduce((s, t) => s + parseFloat(t.amountXRP), 0).toFixed(6),
  leaderboard:   buildLeaderboard(ev), });
});

// Get event summary + leaderboard
app.get("/api/events/:id", (req, res) => {
  const ev = events.get(req.params.id);
  if (!ev) return res.status(404).json({ error: "event not found" });
  res.json({
    id:           ev.id,
    name:         ev.name,
    host:         ev.host,
    createdAt:    ev.createdAt,
    txCount:      ev.transactions.length,
    totalXRP:     ev.transactions.reduce((s, t) => s + parseFloat(t.amountXRP), 0).toFixed(6),
    leaderboard:  buildLeaderboard(ev),
  });
});

// Paginated transaction history
app.get("/api/events/:id/txns", (req, res) => {
  const ev = events.get(req.params.id);
  if (!ev) return res.status(404).json({ error: "event not found" });
  const page  = parseInt(req.query.page  || "0");
  const limit = parseInt(req.query.limit || "30");
  const txns  = ev.transactions.slice(page * limit, (page + 1) * limit);
  res.json({ page, limit, total: ev.transactions.length, txns });
});

// ─── Socket.IO ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

io.on("connection", (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // Client joins an event room
  socket.on("join_event", ({ eventId, address }) => {
    socket.join(eventId);
    console.log(`[WS] ${socket.id} joined event: ${eventId}`);

    // Send current leaderboard on join
    const ev = events.get(eventId);
    if (ev) {
      socket.emit("leaderboard_update", buildLeaderboard(ev));
      // Send last 10 transactions
      socket.emit("history", ev.transactions.slice(0, 10));
    }
  });
socket.on("spray", async (data) => {
    const { eventId, displayName, coin, amountXRP, hash, timestamp } = data;
    if (!eventId || !displayName || !coin) return;

    // Try to create a real ILP incoming payment
    const ilpPayment = await createIncomingPayment("100"); // 1.00 USD in cents

    const spray = {
      hash:        hash || (ilpPayment?.id) || "pending-" + Date.now(),
      from:        "client",
      displayName,
      coin,
      amountXRP:   amountXRP || "0.01",
      timestamp:   timestamp || Date.now(),
      source:      ilpPayment ? "ilp" : "websocket",
      confirmed:   !!ilpPayment,
      ilpPaymentId: ilpPayment?.id || null,
    };

    const leaderboard = recordSpray(eventId, spray);

    io.to(eventId).emit("spray_rx",           spray);
    io.to(eventId).emit("leaderboard_update", leaderboard);

    if (ilpPayment) {
      console.log(`[ILP] ✓ Real payment created for ${displayName}'s spray → ${ilpPayment.id}`);
    } else {
      console.log(`[WS] Spray in ${eventId}: ${displayName} sprayed ${amountXRP} as ${coin} (mock)`);
    }
  });
  socket.on("disconnect", () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});
// ─── Boot ────────────────────────────────────────────────────────────────────
server.listen(PORT, async () => {
  console.log(`\n🎉 DoingsMachine backend running on port ${PORT}`);
  console.log(`   REST API:  http://localhost:${PORT}/api`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   ILP Wallet: ${ILP_WALLET_ADDRESS}\n`);

  // Pre-warm the Open Payments client
  try {
    await getOPClient();
  } catch (err) {
    console.warn("[ILP] Could not initialize Open Payments client:", err.message);
    console.warn("[ILP] Sprays will still work via WebSocket in mock mode.");
  }
});

process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down…");
  server.close(() => process.exit(0));
});