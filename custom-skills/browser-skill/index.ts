/**
 * Browser Skill — OpenClaw-compliant tool
 *
 * Actions: search_web, summarize_page, take_screenshot
 * Uses Playwright (headless Chromium).
 */

import { chromium, type Browser, type Page } from "playwright";
import * as path from "path";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchWebParams {
  query: string;
  limit?: number;
}

interface SummarizePageParams {
  url: string;
  selector?: string;
}

interface TakeScreenshotParams {
  url: string;
  filename?: string;
  fullPage?: boolean;
}

type SkillInput =
  | { action: "search_web"; params: SearchWebParams }
  | { action: "summarize_page"; params: SummarizePageParams }
  | { action: "take_screenshot"; params: TakeScreenshotParams };

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ---------------------------------------------------------------------------
// Workspace path for screenshots
// ---------------------------------------------------------------------------

const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? "/workspace";
const SCREENSHOTS_DIR = path.join(WORKSPACE_DIR, "screenshots");

function ensureScreenshotsDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Action: search_web
// ---------------------------------------------------------------------------

async function searchWeb(
  browser: Browser,
  params: SearchWebParams
): Promise<object> {
  const limit = params.limit ?? 5;
  const page: Page = await browser.newPage();

  try {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(params.query)}&ia=web`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for results to load
    await page.waitForSelector('[data-testid="result"]', { timeout: 10000 }).catch(() => {});

    const results: SearchResult[] = await page.evaluate((maxResults: number) => {
      const items = document.querySelectorAll('[data-testid="result"]');
      const out: SearchResult[] = [];

      items.forEach((item) => {
        if (out.length >= maxResults) return;

        const titleEl = item.querySelector('[data-testid="result-title-a"]');
        const snippetEl = item.querySelector('[data-result="snippet"]');
        const linkEl = item.querySelector('a[href]');

        const title = titleEl?.textContent?.trim() ?? "";
        const snippet = snippetEl?.textContent?.trim() ?? "";
        const url = (linkEl as HTMLAnchorElement)?.href ?? "";

        if (title && url) {
          out.push({ title, url, snippet });
        }
      });

      return out;
    }, limit);

    return {
      success: true,
      query: params.query,
      count: results.length,
      results,
    };
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Action: summarize_page
// ---------------------------------------------------------------------------

async function summarizePage(
  browser: Browser,
  params: SummarizePageParams
): Promise<object> {
  const page: Page = await browser.newPage();
  const selector = params.selector ?? "body";

  try {
    await page.goto(params.url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const title = await page.title();

    const text: string = await page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return "";

      // Remove script/style noise
      const cloned = el.cloneNode(true) as Element;
      cloned.querySelectorAll("script, style, nav, footer, header, aside").forEach((n) => n.remove());

      return cloned.textContent?.replace(/\s+/g, " ").trim() ?? "";
    }, selector);

    const truncated = text.slice(0, 4000);
    const wasTruncated = text.length > 4000;

    return {
      success: true,
      url: params.url,
      title,
      contentLength: text.length,
      truncated: wasTruncated,
      content: truncated,
    };
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Action: take_screenshot
// ---------------------------------------------------------------------------

async function takeScreenshot(
  browser: Browser,
  params: TakeScreenshotParams
): Promise<object> {
  ensureScreenshotsDir();

  const timestamp = Date.now();
  const filename = params.filename ?? `screenshot-${timestamp}.png`;
  const outputPath = path.join(SCREENSHOTS_DIR, filename);
  const fullPage = params.fullPage !== false; // default true

  const page: Page = await browser.newPage();

  try {
    await page.goto(params.url, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: outputPath, fullPage });

    const stats = fs.statSync(outputPath);

    return {
      success: true,
      url: params.url,
      filename,
      path: outputPath,
      sizeBytes: stats.size,
      fullPage,
      message: `Screenshot saved to ${outputPath}`,
    };
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Main
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
    process.stdout.write(JSON.stringify({ error: "Invalid JSON input" }));
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });

  try {
    let result: object;

    switch (input.action) {
      case "search_web":
        result = await searchWeb(browser, input.params);
        break;
      case "summarize_page":
        result = await summarizePage(browser, input.params);
        break;
      case "take_screenshot":
        result = await takeScreenshot(browser, input.params);
        break;
      default:
        result = {
          error: `Unknown action: ${(input as SkillInput).action}. Supported: search_web, summarize_page, take_screenshot`,
        };
    }

    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(
      JSON.stringify({
        error: true,
        message,
        suggestion: "Check the URL is reachable and Playwright is installed.",
      })
    );
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ error: String(err) }));
  process.exit(1);
});
