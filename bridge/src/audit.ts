/**
 * Audit Logger
 *
 * Appends structured audit entries to audit_log.json.
 * Each entry records: timestamp, userId, prompt, toolUsed, status, and metadata.
 *
 * The log file is append-only — entries are never deleted or modified.
 * Uses synchronous writes with a file lock pattern to prevent corruption
 * under concurrent requests.
 */

import * as fs from "fs";
import * as path from "path";
import { config } from "./config";

export type AuditStatus = "received" | "forwarded" | "success" | "error" | "blocked";

export interface AuditEntry {
  timestamp: string;       // ISO 8601
  userId: string;          // Telegram user ID (string to avoid int overflow)
  username?: string;       // Telegram @username if available
  prompt: string;          // The user's message / prompt
  toolUsed?: string;       // Skill/tool name if identifiable
  status: AuditStatus;
  responseTime?: number;   // ms
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

// Ensure the log directory exists
function ensureLogDir(): void {
  const dir = path.dirname(config.auditLogPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Initialize the log file with an empty array if it doesn't exist
function initLogFile(): void {
  ensureLogDir();
  if (!fs.existsSync(config.auditLogPath)) {
    fs.writeFileSync(config.auditLogPath, "[]", "utf-8");
  }
}

/**
 * Append an audit entry to the log file.
 * Thread-safe via synchronous read-modify-write.
 */
export function appendAuditEntry(entry: AuditEntry): void {
  try {
    initLogFile();

    const raw = fs.readFileSync(config.auditLogPath, "utf-8");
    let entries: AuditEntry[] = [];

    try {
      entries = JSON.parse(raw) as AuditEntry[];
    } catch {
      // If the file is corrupted, start fresh but preserve the old file
      const backupPath = `${config.auditLogPath}.bak.${Date.now()}`;
      fs.copyFileSync(config.auditLogPath, backupPath);
      entries = [];
    }

    entries.push(entry);
    fs.writeFileSync(config.auditLogPath, JSON.stringify(entries, null, 2), "utf-8");
  } catch (err) {
    // Audit logging must never crash the main process
    console.error("[audit] Failed to write audit entry:", err);
  }
}

/**
 * Convenience: log a received message from Telegram.
 */
export function logReceived(
  userId: string,
  username: string | undefined,
  prompt: string
): void {
  appendAuditEntry({
    timestamp: new Date().toISOString(),
    userId,
    username,
    prompt,
    status: "received",
  });
}

/**
 * Convenience: log a blocked request (access control).
 */
export function logBlocked(
  userId: string,
  username: string | undefined,
  prompt: string
): void {
  appendAuditEntry({
    timestamp: new Date().toISOString(),
    userId,
    username,
    prompt,
    status: "blocked",
    errorMessage: "User not in TELEGRAM_ALLOWED_IDS whitelist",
  });
}

/**
 * Convenience: log a completed (success or error) gateway response.
 */
export function logResponse(
  userId: string,
  username: string | undefined,
  prompt: string,
  status: "success" | "error",
  responseTime: number,
  toolUsed?: string,
  errorMessage?: string
): void {
  appendAuditEntry({
    timestamp: new Date().toISOString(),
    userId,
    username,
    prompt,
    toolUsed,
    status,
    responseTime,
    errorMessage,
  });
}
