---
name: browser-skill
description: "Browser automation via Playwright. Actions: search_web, summarize_page, take_screenshot."
homepage: https://playwright.dev
metadata:
  {
    "openclaw":
      {
        "emoji": "🌐",
        "requires": { "bins": ["node"] },
        "install":
          [
            {
              "id": "npm",
              "kind": "npm",
              "package": "playwright",
              "label": "Install playwright",
            },
          ],
      },
  }
---

# Browser Skill

Headless browser automation powered by Playwright. Supports web search,
page summarization, and screenshot capture.

## When to Use

✅ **USE this skill when:**

- "Search the web for [topic]"
- "What does [URL] say about [topic]?"
- "Summarize this page: [URL]"
- "Take a screenshot of [URL]"
- "Browse to [URL] and tell me..."

## Actions

### `search_web`

Perform a DuckDuckGo search and return the top results.

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `query`   | Yes      | Search query string |
| `limit`   | No       | Max results to return (default: 5) |

**Example:**
```
Search the web for "TypeScript best practices 2025"
```

### `summarize_page`

Navigate to a URL and extract the main text content.

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `url`     | Yes      | Full URL to visit |
| `selector`| No       | CSS selector to scope extraction (default: `body`) |

**Example:**
```
Summarize the page at https://example.com/article
```

### `take_screenshot`

Capture a full-page screenshot and save it to the workspace.

**Parameters:**
| Parameter  | Required | Description |
|------------|----------|-------------|
| `url`      | Yes      | Full URL to screenshot |
| `filename` | No       | Output filename (default: `screenshot-<timestamp>.png`) |
| `fullPage` | No       | Capture full scrollable page (default: true) |

**Example:**
```
Take a screenshot of https://example.com
```

## Notes

- Runs in headless Chromium (no GUI required)
- Screenshots are saved to `/workspace/screenshots/`
- Page text is truncated to 4000 characters for LLM context
