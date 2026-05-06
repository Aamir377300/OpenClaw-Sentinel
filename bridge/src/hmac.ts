/**
 * HMAC-SHA256 signing and verification middleware.
 *
 * Every request between the Telegram bot and the backend Express server
 * must carry an X-Signature header containing:
 *   HMAC-SHA256(SHARED_SECRET, timestamp + "." + body)
 *
 * The timestamp is also sent as X-Timestamp and must be within 5 minutes
 * of the server clock to prevent replay attacks.
 */

import * as crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config";

const SIGNATURE_HEADER = "x-signature";
const TIMESTAMP_HEADER = "x-timestamp";
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Sign a payload. Returns the hex HMAC-SHA256 signature.
 */
export function signPayload(body: string, timestamp: string): string {
  return crypto
    .createHmac("sha256", config.sharedSecret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

/**
 * Build headers for an outgoing signed request.
 */
export function buildSignedHeaders(body: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const signature = signPayload(body, timestamp);
  return {
    [SIGNATURE_HEADER]: signature,
    [TIMESTAMP_HEADER]: timestamp,
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.gatewayToken}`,
  };
}

/**
 * Express middleware that verifies the HMAC signature on incoming requests.
 * Rejects with 401 if the signature is missing, invalid, or the timestamp
 * is too old.
 */
export function verifyHmac(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const signature = req.headers[SIGNATURE_HEADER] as string | undefined;
  const timestamp = req.headers[TIMESTAMP_HEADER] as string | undefined;

  if (!signature || !timestamp) {
    res.status(401).json({
      error: "Missing HMAC signature or timestamp headers.",
    });
    return;
  }

  // Replay attack prevention
  const age = Date.now() - parseInt(timestamp, 10);
  if (isNaN(age) || age > MAX_AGE_MS || age < -MAX_AGE_MS) {
    res.status(401).json({
      error: "Request timestamp is too old or invalid. Possible replay attack.",
    });
    return;
  }

  // Compute expected signature
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? "";
  const expected = signPayload(rawBody, timestamp);

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature, "hex");
  const expBuffer = Buffer.from(expected, "hex");

  if (
    sigBuffer.length !== expBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expBuffer)
  ) {
    res.status(401).json({ error: "Invalid HMAC signature." });
    return;
  }

  next();
}
