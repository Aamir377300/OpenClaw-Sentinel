---
name: workspace-skill
description: "Full sandboxed file system operations within /workspace. Read, write, append, delete, rename, move, copy, search files and manage directories. Path traversal is strictly blocked."
homepage: https://github.com/openclaw/openclaw
metadata:
  {
    "openclaw":
      {
        "emoji": "📁",
        "requires": { "bins": ["node"] },
        "install": [],
        "triggers":
          [
            "read file", "write file", "delete file", "rename file",
            "move file", "copy file", "list files", "search files",
            "create folder", "delete folder", "file info", "append to file",
            "workspace", "save to file", "what files", "show me the file",
          ],
      },
  }
---

# Workspace Skill

Full file system management confined strictly to the `/workspace` directory.
Supports 12 operations covering every common file and directory task.

Any attempt to access files outside `/workspace` or use `..` path traversal
is blocked before any I/O occurs.

## When to Use

✅ **USE this skill when:**

- "Read / show me the file notes.txt"
- "Write / save [content] to a file"
- "Append [content] to an existing file"
- "Delete the file report.txt"
- "Rename notes.txt to meeting-notes.txt"
- "Move output.txt to archive/output.txt"
- "Copy template.md to new-doc.md"
- "Get info / metadata about a file"
- "List all files in my workspace"
- "Create a folder called reports"
- "Delete the empty folder old-data"
- "Search for files named *.md"
- "Find files containing the word 'budget'"

## Security Model

- All paths are resolved and validated before any operation
- `..` traversal is blocked — e.g. `../../etc/passwd` throws immediately
- Absolute paths outside `/workspace` are blocked
- Symlinks that escape the sandbox are blocked via `fs.realpathSync`
- The workspace root itself cannot be deleted
- Non-empty directories require `recursive: true` to delete

---

## Actions

### `read_file`

Read the contents of a file. Returns UTF-8 text or base64 for binary files.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `path`    | string | Yes      | File path relative to workspace root |

**Example triggers:**
```
Read the file notes.txt
Show me what's in reports/summary.md
```

---

### `write_file`

Write content to a file. Creates parent directories automatically.

| Parameter   | Type    | Required | Default | Description |
|-------------|---------|----------|---------|-------------|
| `path`      | string  | Yes      | —       | File path relative to workspace root |
| `content`   | string  | Yes      | —       | Text content to write |
| `overwrite` | boolean | No       | `true`  | Allow overwriting existing files |

**Example triggers:**
```
Write "Hello World" to hello.txt
Save this summary to reports/2026-05.md
Create a new file called todo.txt with content "Buy milk"
```

---

### `append_file`

Append content to the end of a file. Creates the file if it doesn't exist.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `path`    | string | Yes      | File path relative to workspace root |
| `content` | string | Yes      | Content to append |

**Example triggers:**
```
Append "New entry" to log.txt
Add this line to notes.txt
```

---

### `delete_file`

Permanently delete a file.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `path`    | string | Yes      | File path relative to workspace root |

**Example triggers:**
```
Delete the file old-report.txt
Remove temp.txt from my workspace
```

---

### `rename_file`

Rename a file within its current directory (name change only).
To move to a different directory, use `move_file`.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `path`    | string | Yes      | Current file path |
| `newName` | string | Yes      | New filename (no slashes) |

**Example triggers:**
```
Rename notes.txt to meeting-notes.txt
Rename draft.md to final.md
```

---

### `move_file`

Move a file or directory to a new path within the workspace.

| Parameter     | Type   | Required | Description |
|---------------|--------|----------|-------------|
| `source`      | string | Yes      | Current path |
| `destination` | string | Yes      | New path |

**Example triggers:**
```
Move output.txt to archive/output.txt
Move the reports folder to old/reports
```

---

### `copy_file`

Copy a file to a new path within the workspace.

| Parameter     | Type    | Required | Default | Description |
|---------------|---------|----------|---------|-------------|
| `source`      | string  | Yes      | —       | Source file path |
| `destination` | string  | Yes      | —       | Destination path |
| `overwrite`   | boolean | No       | `true`  | Overwrite if destination exists |

**Example triggers:**
```
Copy template.md to new-project.md
Make a copy of config.json as config.backup.json
```

---

### `file_info`

Get metadata about a file or directory without reading its content.
Returns size, type, extension, created/modified/accessed timestamps, and permissions.

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `path`    | string | Yes      | File or directory path |

**Example triggers:**
```
Get info about report.pdf
How big is the file data.csv?
When was notes.txt last modified?
```

---

### `list_files`

List files and directories. Optionally recursive.

| Parameter   | Type    | Required | Default | Description |
|-------------|---------|----------|---------|-------------|
| `path`      | string  | No       | `.`     | Directory to list |
| `recursive` | boolean | No       | `false` | List all nested files |

**Example triggers:**
```
List all files in my workspace
What's in the reports folder?
Show me all files recursively
```

---

### `create_directory`

Create a directory (and any missing parent directories).

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `path`    | string | Yes      | Directory path to create |

**Example triggers:**
```
Create a folder called reports/2026
Make a new directory named archive
```

---

### `delete_directory`

Delete a directory. Requires `recursive: true` if the directory is not empty.

| Parameter   | Type    | Required | Default | Description |
|-------------|---------|----------|---------|-------------|
| `path`      | string  | Yes      | —       | Directory path to delete |
| `recursive` | boolean | No       | `false` | Delete even if not empty |

**Example triggers:**
```
Delete the empty folder temp
Remove the old-data directory and everything in it
```

---

### `search_files`

Search for files by name pattern (glob) and/or content substring.
Returns matching file paths and up to 5 matching lines per file for content searches.

| Parameter       | Type    | Required | Default | Description |
|-----------------|---------|----------|---------|-------------|
| `pattern`       | string  | No*      | —       | Filename glob pattern (e.g. `*.md`, `report-*`) |
| `content`       | string  | No*      | —       | Text to search for inside files |
| `path`          | string  | No       | `.`     | Directory to search in |
| `caseSensitive` | boolean | No       | `false` | Case-sensitive matching |

*At least one of `pattern` or `content` is required.

**Example triggers:**
```
Search for all markdown files
Find files containing the word "budget"
Search for *.json files in the config folder
Find files with "TODO" in them
```

---

## Limits

| Limit | Value |
|-------|-------|
| Max file read size | 1 MB |
| Max file write size | 10 MB |
| Max content search file size | 1 MB |
| Max matching lines returned per file | 5 |
