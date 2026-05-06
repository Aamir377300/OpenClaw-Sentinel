/**
 * Configuration loader — reads from environment variables only.
 * Throws on startup if required variables are missing.
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from the project root (one level up from bridge/)
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `Copy .env.example to .env and fill in all required values.`
    );
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // Telegram
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  telegramAllowedIds: requireEnv("TELEGRAM_ALLOWED_IDS")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),

  // HMAC shared secret for request signing
  sharedSecret: requireEnv("SHARED_SECRET"),

  // OpenClaw Gateway — official port is 18789
  gatewayUrl: optionalEnv("OPENCLAW_GATEWAY_URL", "http://localhost:18789"),
  gatewayToken: requireEnv("OPENCLAW_GATEWAY_TOKEN"),

  // Bridge HTTP server
  bridgePort: parseInt(optionalEnv("BRIDGE_PORT", "4000"), 10),

  // Audit log path
  auditLogPath: optionalEnv("AUDIT_LOG_PATH", "/home/node/app/audit_log.json"),
} as const;
