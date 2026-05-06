/**
 * Telegram Bot
 *
 * Integrates with Telegraf. Enforces the TELEGRAM_ALLOWED_IDS whitelist
 * before forwarding any message to the OpenClaw Gateway.
 *
 * Every interaction is recorded in the audit log.
 */

import { Telegraf, type Context } from "telegraf";
import { config } from "./config";
import { forwardToGateway, extractAxiosError } from "./gateway";
import { logReceived, logBlocked, logResponse } from "./audit";

export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegramBotToken);

  // ---------------------------------------------------------------------------
  // Access control middleware — runs before every update
  // ---------------------------------------------------------------------------
  bot.use(async (ctx: Context, next) => {
    const userId = ctx.from?.id?.toString();
    const username = ctx.from?.username;

    if (!userId) {
      // No user context (e.g. channel posts) — skip
      return;
    }

    if (!config.telegramAllowedIds.includes(userId)) {
      logBlocked(userId, username, ctx.text ?? "[non-text message]");
      await ctx.reply(
        "⛔ Access denied. Your Telegram ID is not on the allowed list.\n" +
          "Contact the administrator to request access."
      );
      return; // Do not call next()
    }

    return next();
  });

  // ---------------------------------------------------------------------------
  // /start command
  // ---------------------------------------------------------------------------
  bot.start(async (ctx) => {
    await ctx.reply(
      "👋 Welcome to the OpenClaw AI Assistant!\n\n" +
        "Send me any message and I'll forward it to the AI agent.\n\n" +
        "Available skills:\n" +
        "• 📧 Email — send emails, summarize inbox\n" +
        "• 🌐 Browser — search web, summarize pages, screenshots\n" +
        "• 📁 Workspace — read, write, list files\n\n" +
        "Type /help for more information."
    );
  });

  // ---------------------------------------------------------------------------
  // /help command
  // ---------------------------------------------------------------------------
  bot.help(async (ctx) => {
    await ctx.reply(
      "🤖 *OpenClaw AI Assistant*\n\n" +
        "Just send me a natural language message. Examples:\n\n" +
        "📧 *Email:*\n" +
        '`Send an email to alice@example.com about the meeting`\n' +
        '`Summarize my inbox`\n\n' +
        "🌐 *Browser:*\n" +
        '`Search the web for TypeScript best practices`\n' +
        '`Summarize https://example.com`\n' +
        '`Take a screenshot of https://example.com`\n\n' +
        "📁 *Workspace:*\n" +
        '`List files in my workspace`\n' +
        '`Read notes.txt`\n' +
        '`Write "Hello" to hello.txt`',
      { parse_mode: "Markdown" }
    );
  });

  // ---------------------------------------------------------------------------
  // /status command
  // ---------------------------------------------------------------------------
  bot.command("status", async (ctx) => {
    await ctx.reply(
      `✅ Bridge is running\n` +
        `Gateway: ${config.gatewayUrl}\n` +
        `Your ID: ${ctx.from?.id}`
    );
  });

  // ---------------------------------------------------------------------------
  // Main message handler
  // ---------------------------------------------------------------------------
  bot.on("text", async (ctx) => {
    const userId = ctx.from.id.toString();
    const username = ctx.from.username;
    const prompt = ctx.message.text;

    logReceived(userId, username, prompt);

    // Show typing indicator
    await ctx.sendChatAction("typing");

    const startTime = Date.now();

    try {
      const { reply, toolUsed } = await forwardToGateway(prompt, userId);
      const responseTime = Date.now() - startTime;

      logResponse(userId, username, prompt, "success", responseTime, toolUsed);

      // Telegram has a 4096 char limit per message
      if (reply.length <= 4096) {
        await ctx.reply(reply);
      } else {
        // Split into chunks
        const chunks = reply.match(/.{1,4000}/gs) ?? [reply];
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      }
    } catch (err) {
      const responseTime = Date.now() - startTime;
      const errorMessage = extractAxiosError(err);

      logResponse(userId, username, prompt, "error", responseTime, undefined, errorMessage);

      await ctx.reply(
        `❌ Error: ${errorMessage}\n\nPlease try again or contact the administrator.`
      );
    }
  });

  // Handle non-text messages gracefully
  bot.on("message", async (ctx) => {
    await ctx.reply(
      "I can only process text messages at the moment. Please send a text message."
    );
  });

  return bot;
}
