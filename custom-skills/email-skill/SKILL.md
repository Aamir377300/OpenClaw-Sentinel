---
name: email-skill
description: "Send emails via SMTP and summarize your inbox via IMAP. Supports send_email and summarize_inbox actions."
homepage: https://github.com/openclaw/openclaw
metadata:
  {
    "openclaw":
      {
        "emoji": "📧",
        "requires": { "bins": ["node"] },
        "install":
          [
            {
              "id": "npm",
              "kind": "npm",
              "package": "nodemailer",
              "label": "Install nodemailer",
            },
            {
              "id": "npm-imap",
              "kind": "npm",
              "package": "imapflow",
              "label": "Install imapflow",
            },
          ],
        "env":
          [
            { "key": "EMAIL_USER", "description": "SMTP/IMAP email address" },
            { "key": "EMAIL_PASS", "description": "SMTP/IMAP password or app password" },
            { "key": "SMTP_HOST", "description": "SMTP server hostname (e.g. smtp.gmail.com)" },
            { "key": "SMTP_PORT", "description": "SMTP port (default: 587)" },
            { "key": "IMAP_HOST", "description": "IMAP server hostname (e.g. imap.gmail.com)" },
            { "key": "IMAP_PORT", "description": "IMAP port (default: 993)" },
          ],
      },
  }
---

# Email Skill

Send emails via SMTP and summarize your inbox via IMAP. Credentials are loaded
from environment variables — never hardcoded.

## When to Use

✅ **USE this skill when:**

- "Send an email to someone@example.com"
- "Email [person] about [topic]"
- "What's in my inbox?"
- "Summarize my unread emails"
- "Check my email"

## Actions

### `send_email`

Send an email via SMTP.

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `to`      | Yes      | Recipient email address |
| `subject` | Yes      | Email subject line |
| `body`    | Yes      | Email body (plain text or HTML) |
| `cc`      | No       | CC recipients (comma-separated) |
| `html`    | No       | Set to `true` to send HTML body |

**Example:**
```
Send an email to alice@example.com with subject "Meeting Tomorrow" and body "Hi Alice, just confirming our 10am meeting."
```

### `summarize_inbox`

Fetch and summarize recent unread emails via IMAP.

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `limit`   | No       | Max emails to fetch (default: 10) |
| `folder`  | No       | Mailbox folder (default: INBOX) |

**Example:**
```
Summarize my inbox
What are my unread emails?
```

## Environment Variables Required

```
EMAIL_USER=you@example.com
EMAIL_PASS=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
```

## Security Notes

- Credentials are **never** logged or echoed
- Use app-specific passwords (not your main account password)
- For Gmail: enable 2FA and generate an App Password
