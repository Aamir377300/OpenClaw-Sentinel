/**
 * Bridge Server — Express + Telegraf
 *
 * Exposes:
 *   POST /webhook/telegram  — Telegram webhook endpoint (HMAC-verified)
 *   GET  /health            — Health check
 *   GET  /audit             — Last N audit entries (admin only)
 *
 * Security layers:
 *   1. HMAC-SHA256 signature verification on all non-health endpoints
 *   2. Telegram user ID whitelist (enforced in bot.ts)
 *   3. Raw body capture for accurate HMAC computation
 */

import express, { type Request, type Response, type NextFunction } from "express";
import * as fs from "fs";
import { config } from "./config";
import { verifyHmac } from "./hmac";
import { createBot } from "./bot";
import { appendAuditEntry } from "./audit";

// ---------------------------------------------------------------------------
// Express app setup
// ---------------------------------------------------------------------------

const app = express();

// Capture raw body for HMAC verification BEFORE JSON parsing
app.use((req: Request, _res: Response, next: NextFunction) => {
  let data = "";
  req.setEncoding("utf-8");
  req.on("data", (chunk: string) => {
    data += chunk;
  });
  req.on("end", () => {
    (req as Request & { rawBody: string }).rawBody = data;
    next();
  });
});

// Parse JSON after raw body capture
app.use(express.json());

// ---------------------------------------------------------------------------
// Health check — no auth required
// ---------------------------------------------------------------------------

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "openclaw-bridge",
    timestamp: new Date().toISOString(),
    gateway: config.gatewayUrl,
    gatewayHealthUrl: `${config.gatewayUrl}/healthz`,
  });
});

// ---------------------------------------------------------------------------
// Audit log viewer — HMAC-protected
// ---------------------------------------------------------------------------

app.get("/audit", verifyHmac, (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(config.auditLogPath)) {
      res.json({ entries: [], count: 0 });
      return;
    }

    const raw = fs.readFileSync(config.auditLogPath, "utf-8");
    const entries = JSON.parse(raw) as unknown[];
    const limit = parseInt((req.query.limit as string) ?? "50", 10);
    const recent = entries.slice(-Math.min(limit, 500));

    res.json({ entries: recent, count: recent.length, total: entries.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to read audit log" });
  }
});

// ---------------------------------------------------------------------------
// Telegram webhook endpoint — HMAC-protected
// ---------------------------------------------------------------------------

app.post("/webhook/telegram", verifyHmac, (req: Request, res: Response) => {
  // The bot processes updates via polling in development.
  // In production with a webhook, Telegraf handles the update here.
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[bridge] Unhandled error:", err.message);
  appendAuditEntry({
    timestamp: new Date().toISOString(),
    userId: "system",
    prompt: "[server error]",
    status: "error",
    errorMessage: err.message,
  });
  res.status(500).json({ error: "Internal server error" });
});

// ---------------------------------------------------------------------------
// Start bot and server
// ---------------------------------------------------------------------------

async function main() {
  console.log("[bridge] Starting OpenClaw Bridge...");
  console.log(`[bridge] Gateway URL: ${config.gatewayUrl}`);
  console.log(`[bridge] Allowed Telegram IDs: ${config.telegramAllowedIds.join(", ")}`);

  // Start Telegram bot in long-polling mode
  const bot = createBot();

  // Graceful shutdown
  process.once("SIGINT", () => {
    console.log("[bridge] Shutting down...");
    bot.stop("SIGINT");
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    console.log("[bridge] Shutting down...");
    bot.stop("SIGTERM");
    process.exit(0);
  });

  // Launch bot (long polling)
  bot.launch().catch((err: Error) => {
    console.error("[bridge] Bot launch failed:", err.message);
    process.exit(1);
  });

  // Start HTTP server
  app.listen(config.bridgePort, () => {
    console.log(`[bridge] HTTP server listening on port ${config.bridgePort}`);
    console.log(`[bridge] Health check: http://localhost:${config.bridgePort}/health`);
  });
}

main().catch((err: Error) => {
  console.error("[bridge] Fatal startup error:", err.message);
  process.exit(1);
});
