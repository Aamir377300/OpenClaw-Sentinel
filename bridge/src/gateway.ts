/**
 * OpenClaw Gateway client.
 *
 * Forwards prompts to the OpenClaw Gateway via its OpenAI-compatible REST API.
 * The gateway runs on port 18789 and uses Bearer token auth.
 *
 * API endpoint: POST /v1/chat/completions
 * Auth header:  Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
 *
 * The OpenAI-compat endpoint must be enabled in openclaw.json:
 *   gateway.openAiChatCompletions.enabled = true
 */

import axios, { type AxiosError } from "axios";
import { config } from "./config";

export interface GatewayResponse {
  reply: string;
  toolUsed?: string;
  raw?: unknown;
}

/**
 * Send a prompt to the OpenClaw Gateway and return the assistant's reply.
 *
 * @param prompt  The user's message
 * @param userId  Telegram user ID (used as session identifier)
 */
export async function forwardToGateway(
  prompt: string,
  userId: string
): Promise<GatewayResponse> {
  const body = {
    model: "openclaw",
    messages: [
      { role: "user", content: prompt },
    ],
    // Pass the session ID as a custom header so the gateway can maintain
    // per-user conversation context where supported.
    user: `telegram-${userId}`,
    stream: false,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.gatewayToken}`,
  };

  const response = await axios.post(
    `${config.gatewayUrl}/v1/chat/completions`,
    body,
    { headers, timeout: 60_000 }
  );

  const data = response.data as Record<string, unknown>;

  // OpenAI-compatible response shape: choices[0].message.content
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  const reply =
    choices?.[0]?.message?.content ??
    (data.reply as string | undefined) ??
    (data.message as string | undefined) ??
    (data.content as string | undefined) ??
    JSON.stringify(data);

  return { reply, raw: data };
}

/**
 * Extract a human-readable error message from an Axios error.
 */
export function extractAxiosError(err: unknown): string {
  const axiosErr = err as AxiosError;
  if (axiosErr.response) {
    const data = axiosErr.response.data as Record<string, unknown> | undefined;
    return (
      (data?.error as string) ??
      (data?.message as string) ??
      `Gateway returned HTTP ${axiosErr.response.status}`
    );
  }
  if (axiosErr.request) {
    return `Gateway unreachable at ${config.gatewayUrl}. Is it running?`;
  }
  return axiosErr.message ?? "Unknown gateway error";
}
