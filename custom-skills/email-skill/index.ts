/**
 * Email Skill — OpenClaw-compliant tool
 *
 * Actions: send_email, summarize_inbox
 * Credentials are loaded exclusively from environment variables.
 * Never log or echo EMAIL_USER / EMAIL_PASS values.
 */

import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import * as dotenv from "dotenv";

dotenv.config();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  html?: boolean;
}

interface SummarizeInboxParams {
  limit?: number;
  folder?: string;
}

interface SkillInput {
  action: "send_email" | "summarize_inbox";
  params: SendEmailParams | SummarizeInboxParams;
}

interface EmailSummary {
  uid: number;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

// ---------------------------------------------------------------------------
// Helpers — credentials from env only
// ---------------------------------------------------------------------------

function getSmtpConfig() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);

  if (!user || !pass) {
    throw new Error(
      "Missing required env vars: EMAIL_USER and EMAIL_PASS must be set."
    );
  }
  return { user, pass, host, port };
}

function getImapConfig() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const host = process.env.IMAP_HOST ?? "imap.gmail.com";
  const port = parseInt(process.env.IMAP_PORT ?? "993", 10);

  if (!user || !pass) {
    throw new Error(
      "Missing required env vars: EMAIL_USER and EMAIL_PASS must be set."
    );
  }
  return { user, pass, host, port };
}

// ---------------------------------------------------------------------------
// Action: send_email
// ---------------------------------------------------------------------------

async function sendEmail(params: SendEmailParams): Promise<object> {
  const { user, pass, host, port } = getSmtpConfig();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const mailOptions: nodemailer.SendMailOptions = {
    from: user,
    to: params.to,
    subject: params.subject,
    ...(params.html ? { html: params.body } : { text: params.body }),
    ...(params.cc ? { cc: params.cc } : {}),
  };

  const info = await transporter.sendMail(mailOptions);

  return {
    success: true,
    messageId: info.messageId,
    to: params.to,
    subject: params.subject,
    message: `Email sent successfully to ${params.to}`,
  };
}

// ---------------------------------------------------------------------------
// Action: summarize_inbox
// ---------------------------------------------------------------------------

async function summarizeInbox(
  params: SummarizeInboxParams
): Promise<object> {
  const { user, pass, host, port } = getImapConfig();
  const limit = params.limit ?? 10;
  const folder = params.folder ?? "INBOX";

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false, // suppress verbose IMAP logs
  });

  await client.connect();

  const summaries: EmailSummary[] = [];

  try {
    const lock = await client.getMailboxLock(folder);
    try {
      // Fetch the most recent `limit` messages
      const messages = client.fetch(
        { seen: false },
        { envelope: true, bodyStructure: true, bodyParts: ["1"] },
        { uid: true }
      );

      let count = 0;
      for await (const msg of messages) {
        if (count >= limit) break;

        const from =
          msg.envelope?.from?.[0]?.address ??
          msg.envelope?.from?.[0]?.name ??
          "Unknown";
        const subject = msg.envelope?.subject ?? "(no subject)";
        const date = msg.envelope?.date?.toISOString() ?? "";

        // Extract a short text snippet from the body part
        let snippet = "";
        const bodyPart = msg.bodyParts?.get("1");
        if (bodyPart) {
          const raw = bodyPart.toString("utf-8");
          snippet = raw.replace(/\s+/g, " ").trim().slice(0, 200);
        }

        summaries.push({
          uid: msg.uid,
          from,
          subject,
          date,
          snippet,
        });
        count++;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return {
    success: true,
    folder,
    count: summaries.length,
    emails: summaries,
    summary: `Found ${summaries.length} unread email(s) in ${folder}.`,
  };
}

// ---------------------------------------------------------------------------
// Main — reads JSON from stdin, writes JSON to stdout (OpenClaw protocol)
// ---------------------------------------------------------------------------

async function main() {
  let raw = "";
  process.stdin.setEncoding("utf-8");

  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  let input: SkillInput;
  try {
    input = JSON.parse(raw) as SkillInput;
  } catch {
    process.stdout.write(
      JSON.stringify({ error: "Invalid JSON input", raw })
    );
    process.exit(1);
  }

  try {
    let result: object;

    switch (input.action) {
      case "send_email":
        result = await sendEmail(input.params as SendEmailParams);
        break;
      case "summarize_inbox":
        result = await summarizeInbox(input.params as SummarizeInboxParams);
        break;
      default:
        result = {
          error: `Unknown action: ${(input as SkillInput).action}. Supported: send_email, summarize_inbox`,
        };
    }

    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(
      JSON.stringify({ error: true, message, suggestion: "Check your .env credentials and network connectivity." })
    );
    process.exit(1);
  }
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ error: String(err) }));
  process.exit(1);
});
