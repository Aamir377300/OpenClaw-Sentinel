/**
 * Workspace Skill — OpenClaw-compliant tool
 *
 * Actions:
 *   read_file        — Read a file's contents
 *   write_file       — Write/overwrite a file
 *   append_file      — Append content to an existing file
 *   delete_file      — Delete a file
 *   rename_file      — Rename a file in-place
 *   move_file        — Move a file to a different path
 *   copy_file        — Copy a file to a new path
 *   file_info        — Get metadata (size, dates, type) for a path
 *   list_files       — List directory contents
 *   create_directory — Create a directory (with parents)
 *   delete_directory — Delete a directory (optionally recursive)
 *   search_files     — Search for files by name pattern or content substring
 *
 * SECURITY: All paths are validated via validatePath() before any I/O.
 * Any path that resolves outside WORKSPACE_ROOT or uses ".." traversal
 * throws an error immediately — no operation is performed.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Workspace root — configurable via env, defaults to /workspace
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = path.resolve(
  process.env.WORKSPACE_DIR ?? "/workspace"
);

const MAX_READ_BYTES  = 1  * 1024 * 1024;  // 1 MB
const MAX_WRITE_BYTES = 10 * 1024 * 1024;  // 10 MB

// ---------------------------------------------------------------------------
// Security: validatePath
//
// Throws if the resolved path is outside WORKSPACE_ROOT or if the input
// contains ".." segments. This is the single enforcement point for all I/O.
// ---------------------------------------------------------------------------

function validatePath(inputPath: string): string {
  // Block explicit ".." traversal in the raw input
  const normalized = path.normalize(inputPath);
  if (normalized.includes("..")) {
    throw new Error(
      `Security violation: path traversal detected in "${inputPath}". ` +
        `Access outside the workspace is not permitted.`
    );
  }

  // Resolve to absolute path
  const resolved = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(WORKSPACE_ROOT, inputPath);

  // Ensure the resolved path starts with the workspace root.
  // Trailing separator prevents prefix attacks (e.g. /workspace-evil).
  const safeRoot = WORKSPACE_ROOT.endsWith(path.sep)
    ? WORKSPACE_ROOT
    : WORKSPACE_ROOT + path.sep;

  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(safeRoot)) {
    throw new Error(
      `Security violation: path "${inputPath}" resolves to "${resolved}", ` +
        `which is outside the allowed workspace directory "${WORKSPACE_ROOT}".`
    );
  }

  // Resolve symlinks and re-validate (prevents symlink escape attacks)
  try {
    const real = fs.realpathSync(resolved);
    if (real !== WORKSPACE_ROOT && !real.startsWith(safeRoot)) {
      throw new Error(
        `Security violation: symlink "${inputPath}" resolves to "${real}", ` +
          `which is outside the workspace.`
      );
    }
    return real;
  } catch (err) {
    // realpathSync throws ENOENT if the path doesn't exist yet (new file).
    // The pre-symlink check above is sufficient in that case.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return resolved;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReadFileParams       { path: string }
interface WriteFileParams      { path: string; content: string; overwrite?: boolean }
interface AppendFileParams     { path: string; content: string }
interface DeleteFileParams     { path: string }
interface RenameFileParams     { path: string; newName: string }
interface MoveFileParams       { source: string; destination: string }
interface CopyFileParams       { source: string; destination: string; overwrite?: boolean }
interface FileInfoParams       { path: string }
interface ListFilesParams      { path?: string; recursive?: boolean }
interface CreateDirectoryParams{ path: string }
interface DeleteDirectoryParams{ path: string; recursive?: boolean }
interface SearchFilesParams    { pattern?: string; content?: string; path?: string; caseSensitive?: boolean }

type SkillInput =
  | { action: "read_file";        params: ReadFileParams }
  | { action: "write_file";       params: WriteFileParams }
  | { action: "append_file";      params: AppendFileParams }
  | { action: "delete_file";      params: DeleteFileParams }
  | { action: "rename_file";      params: RenameFileParams }
  | { action: "move_file";        params: MoveFileParams }
  | { action: "copy_file";        params: CopyFileParams }
  | { action: "file_info";        params: FileInfoParams }
  | { action: "list_files";       params: ListFilesParams }
  | { action: "create_directory"; params: CreateDirectoryParams }
  | { action: "delete_directory"; params: DeleteDirectoryParams }
  | { action: "search_files";     params: SearchFilesParams };

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  sizeBytes?: number;
  modifiedAt?: string;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Action: read_file
// ---------------------------------------------------------------------------

function readFile(params: ReadFileParams): object {
  const safePath = validatePath(params.path);

  if (!fs.existsSync(safePath)) {
    throw new Error(`File not found: ${params.path}`);
  }

  const stat = fs.statSync(safePath);

  if (stat.isDirectory()) {
    throw new Error(`"${params.path}" is a directory. Use list_files instead.`);
  }

  if (stat.size > MAX_READ_BYTES) {
    throw new Error(
      `File too large: ${stat.size} bytes exceeds the 1 MB read limit.`
    );
  }

  const buffer = fs.readFileSync(safePath);

  // Detect binary content
  const isBinary = buffer.some(
    (byte) => byte === 0 || (byte < 8 && byte !== 9 && byte !== 10 && byte !== 13)
  );

  if (isBinary) {
    return {
      success: true,
      path: params.path,
      encoding: "base64",
      content: buffer.toString("base64"),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  return {
    success: true,
    path: params.path,
    encoding: "utf-8",
    content: buffer.toString("utf-8"),
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    lines: buffer.toString("utf-8").split("\n").length,
  };
}

// ---------------------------------------------------------------------------
// Action: write_file
// ---------------------------------------------------------------------------

function writeFile(params: WriteFileParams): object {
  const safePath = validatePath(params.path);

  if (Buffer.byteLength(params.content, "utf-8") > MAX_WRITE_BYTES) {
    throw new Error(`Content too large: exceeds the 10 MB write limit.`);
  }

  const overwrite = params.overwrite !== false; // default true

  if (!overwrite && fs.existsSync(safePath)) {
    throw new Error(
      `File already exists: "${params.path}". Set overwrite: true to replace it.`
    );
  }

  // Create parent directories if needed (all within workspace)
  const dir = path.dirname(safePath);
  validatePath(dir);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(safePath, params.content, "utf-8");
  const stat = fs.statSync(safePath);

  return {
    success: true,
    path: params.path,
    sizeBytes: stat.size,
    message: `File written successfully: ${params.path}`,
  };
}

// ---------------------------------------------------------------------------
// Action: append_file
// ---------------------------------------------------------------------------

function appendFile(params: AppendFileParams): object {
  const safePath = validatePath(params.path);

  if (Buffer.byteLength(params.content, "utf-8") > MAX_WRITE_BYTES) {
    throw new Error(`Content too large: exceeds the 10 MB write limit.`);
  }

  // Create parent directories if needed
  const dir = path.dirname(safePath);
  validatePath(dir);
  fs.mkdirSync(dir, { recursive: true });

  fs.appendFileSync(safePath, params.content, "utf-8");
  const stat = fs.statSync(safePath);

  return {
    success: true,
    path: params.path,
    sizeBytes: stat.size,
    message: `Content appended to: ${params.path}`,
  };
}

// ---------------------------------------------------------------------------
// Action: delete_file
// ---------------------------------------------------------------------------

function deleteFile(params: DeleteFileParams): object {
  const safePath = validatePath(params.path);

  if (!fs.existsSync(safePath)) {
    throw new Error(`File not found: ${params.path}`);
  }

  const stat = fs.statSync(safePath);
  if (stat.isDirectory()) {
    throw new Error(
      `"${params.path}" is a directory. Use delete_directory instead.`
    );
  }

  fs.unlinkSync(safePath);

  return {
    success: true,
    path: params.path,
    message: `File deleted: ${params.path}`,
  };
}

// ---------------------------------------------------------------------------
// Action: rename_file
// Renames a file within the same directory (name only, no path change).
// ---------------------------------------------------------------------------

function renameFile(params: RenameFileParams): object {
  const safeSrc = validatePath(params.path);

  if (!fs.existsSync(safeSrc)) {
    throw new Error(`File not found: ${params.path}`);
  }

  // newName must be a bare filename — no slashes allowed
  if (params.newName.includes("/") || params.newName.includes("\\")) {
    throw new Error(
      `newName must be a filename only (no slashes). Use move_file to change directories.`
    );
  }

  const dir = path.dirname(safeSrc);
  const destPath = path.join(dir, params.newName);
  const safeDest = validatePath(path.relative(WORKSPACE_ROOT, destPath));

  if (fs.existsSync(safeDest)) {
    throw new Error(
      `A file named "${params.newName}" already exists in the same directory.`
    );
  }

  fs.renameSync(safeSrc, safeDest);

  return {
    success: true,
    oldPath: params.path,
    newPath: path.relative(WORKSPACE_ROOT, safeDest),
    message: `Renamed "${params.path}" → "${params.newName}"`,
  };
}

// ---------------------------------------------------------------------------
// Action: move_file
// Moves a file or directory to a new path within the workspace.
// ---------------------------------------------------------------------------

function moveFile(params: MoveFileParams): object {
  const safeSrc  = validatePath(params.source);
  const safeDest = validatePath(params.destination);

  if (!fs.existsSync(safeSrc)) {
    throw new Error(`Source not found: ${params.source}`);
  }

  if (fs.existsSync(safeDest)) {
    throw new Error(
      `Destination already exists: "${params.destination}". Delete it first or choose a different name.`
    );
  }

  // Ensure destination parent directory exists
  const destDir = path.dirname(safeDest);
  validatePath(path.relative(WORKSPACE_ROOT, destDir));
  fs.mkdirSync(destDir, { recursive: true });

  fs.renameSync(safeSrc, safeDest);

  return {
    success: true,
    source: params.source,
    destination: params.destination,
    message: `Moved "${params.source}" → "${params.destination}"`,
  };
}

// ---------------------------------------------------------------------------
// Action: copy_file
// ---------------------------------------------------------------------------

function copyFile(params: CopyFileParams): object {
  const safeSrc  = validatePath(params.source);
  const safeDest = validatePath(params.destination);

  if (!fs.existsSync(safeSrc)) {
    throw new Error(`Source not found: ${params.source}`);
  }

  const srcStat = fs.statSync(safeSrc);
  if (srcStat.isDirectory()) {
    throw new Error(
      `"${params.source}" is a directory. copy_file only copies individual files.`
    );
  }

  const overwrite = params.overwrite !== false; // default true
  if (!overwrite && fs.existsSync(safeDest)) {
    throw new Error(
      `Destination already exists: "${params.destination}". Set overwrite: true to replace it.`
    );
  }

  // Ensure destination parent directory exists
  const destDir = path.dirname(safeDest);
  validatePath(path.relative(WORKSPACE_ROOT, destDir));
  fs.mkdirSync(destDir, { recursive: true });

  fs.copyFileSync(safeSrc, safeDest);
  const destStat = fs.statSync(safeDest);

  return {
    success: true,
    source: params.source,
    destination: params.destination,
    sizeBytes: destStat.size,
    message: `Copied "${params.source}" → "${params.destination}"`,
  };
}

// ---------------------------------------------------------------------------
// Action: file_info
// Returns metadata for a file or directory without reading its content.
// ---------------------------------------------------------------------------

function fileInfo(params: FileInfoParams): object {
  const safePath = validatePath(params.path);

  if (!fs.existsSync(safePath)) {
    throw new Error(`Path not found: ${params.path}`);
  }

  const stat = fs.statSync(safePath);
  const ext  = path.extname(params.path).toLowerCase();

  return {
    success: true,
    path: params.path,
    type: stat.isDirectory() ? "directory" : "file",
    sizeBytes: stat.size,
    sizeHuman: formatBytes(stat.size),
    extension: ext || null,
    createdAt: stat.birthtime.toISOString(),
    modifiedAt: stat.mtime.toISOString(),
    accessedAt: stat.atime.toISOString(),
    isReadOnly: !isWritable(safePath),
    permissions: (stat.mode & 0o777).toString(8),
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isWritable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Action: list_files
// ---------------------------------------------------------------------------

function listFilesRecursive(dir: string, baseDir: string): FileEntry[] {
  const entries: FileEntry[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (item.isDirectory()) {
      entries.push({ name: item.name, path: relativePath, type: "directory" });
      entries.push(...listFilesRecursive(fullPath, baseDir));
    } else if (item.isFile()) {
      const stat = fs.statSync(fullPath);
      entries.push({
        name: item.name,
        path: relativePath,
        type: "file",
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }

  return entries;
}

function listFiles(params: ListFilesParams): object {
  const subPath  = params.path ?? ".";
  const safePath = validatePath(subPath);
  const recursive = params.recursive ?? false;

  if (!fs.existsSync(safePath)) {
    throw new Error(`Directory not found: ${subPath}`);
  }

  const stat = fs.statSync(safePath);
  if (!stat.isDirectory()) {
    throw new Error(`"${subPath}" is a file, not a directory.`);
  }

  let entries: FileEntry[];

  if (recursive) {
    entries = listFilesRecursive(safePath, safePath);
  } else {
    const items = fs.readdirSync(safePath, { withFileTypes: true });
    entries = items.map((item) => {
      const fullPath = path.join(safePath, item.name);
      if (item.isDirectory()) {
        return { name: item.name, path: item.name, type: "directory" as const };
      }
      const s = fs.statSync(fullPath);
      return {
        name: item.name,
        path: item.name,
        type: "file" as const,
        sizeBytes: s.size,
        modifiedAt: s.mtime.toISOString(),
      };
    });
  }

  const fileCount = entries.filter((e) => e.type === "file").length;
  const dirCount  = entries.filter((e) => e.type === "directory").length;

  return {
    success: true,
    directory: subPath,
    count: entries.length,
    fileCount,
    dirCount,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Action: create_directory
// ---------------------------------------------------------------------------

function createDirectory(params: CreateDirectoryParams): object {
  const safePath = validatePath(params.path);

  if (fs.existsSync(safePath)) {
    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) {
      return {
        success: true,
        path: params.path,
        message: `Directory already exists: ${params.path}`,
        alreadyExisted: true,
      };
    }
    throw new Error(
      `A file already exists at "${params.path}". Cannot create directory there.`
    );
  }

  fs.mkdirSync(safePath, { recursive: true });

  return {
    success: true,
    path: params.path,
    message: `Directory created: ${params.path}`,
  };
}

// ---------------------------------------------------------------------------
// Action: delete_directory
// ---------------------------------------------------------------------------

function deleteDirectory(params: DeleteDirectoryParams): object {
  const safePath = validatePath(params.path);

  if (!fs.existsSync(safePath)) {
    throw new Error(`Directory not found: ${params.path}`);
  }

  const stat = fs.statSync(safePath);
  if (!stat.isDirectory()) {
    throw new Error(
      `"${params.path}" is a file, not a directory. Use delete_file instead.`
    );
  }

  // Safety: never allow deleting the workspace root itself
  if (safePath === WORKSPACE_ROOT) {
    throw new Error(
      `Cannot delete the workspace root directory itself.`
    );
  }

  const recursive = params.recursive ?? false;
  const items = fs.readdirSync(safePath);

  if (items.length > 0 && !recursive) {
    throw new Error(
      `Directory "${params.path}" is not empty. Set recursive: true to delete it and all its contents.`
    );
  }

  fs.rmSync(safePath, { recursive: true, force: false });

  return {
    success: true,
    path: params.path,
    message: `Directory deleted: ${params.path}`,
  };
}

// ---------------------------------------------------------------------------
// Action: search_files
// Search by filename pattern (glob-style wildcard) and/or content substring.
// ---------------------------------------------------------------------------

interface SearchMatch {
  path: string;
  type: "file" | "directory";
  sizeBytes?: number;
  matchedContent?: string[];  // lines containing the content match
}

function matchesPattern(name: string, pattern: string, caseSensitive: boolean): boolean {
  // Convert simple glob pattern (* and ?) to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const flags = caseSensitive ? "" : "i";
  return new RegExp(`^${escaped}$`, flags).test(name);
}

function searchFilesRecursive(
  dir: string,
  baseDir: string,
  pattern: string | undefined,
  content: string | undefined,
  caseSensitive: boolean,
  results: SearchMatch[]
): void {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath    = path.join(dir, item.name);
    const relativePath = path.relative(baseDir, fullPath);

    const nameMatches = pattern
      ? matchesPattern(item.name, pattern, caseSensitive)
      : true;

    if (item.isDirectory()) {
      if (nameMatches && !content) {
        results.push({ path: relativePath, type: "directory" });
      }
      // Always recurse into subdirectories
      searchFilesRecursive(fullPath, baseDir, pattern, content, caseSensitive, results);
    } else if (item.isFile()) {
      if (!nameMatches) continue;

      const stat = fs.statSync(fullPath);

      if (!content) {
        results.push({ path: relativePath, type: "file", sizeBytes: stat.size });
        continue;
      }

      // Content search — only in text files under 1 MB
      if (stat.size > MAX_READ_BYTES) continue;

      try {
        const text = fs.readFileSync(fullPath, "utf-8");
        const searchStr = caseSensitive ? content : content.toLowerCase();
        const lines = text.split("\n");
        const matchedLines = lines
          .map((line, i) => ({ line, i }))
          .filter(({ line }) =>
            caseSensitive
              ? line.includes(searchStr)
              : line.toLowerCase().includes(searchStr)
          )
          .map(({ line, i }) => `L${i + 1}: ${line.trim()}`)
          .slice(0, 5); // max 5 matching lines per file

        if (matchedLines.length > 0) {
          results.push({
            path: relativePath,
            type: "file",
            sizeBytes: stat.size,
            matchedContent: matchedLines,
          });
        }
      } catch {
        // Skip unreadable / binary files silently
      }
    }
  }
}

function searchFiles(params: SearchFilesParams): object {
  const searchRoot = validatePath(params.path ?? ".");
  const caseSensitive = params.caseSensitive ?? false;

  if (!fs.existsSync(searchRoot)) {
    throw new Error(`Search directory not found: ${params.path ?? "."}`);
  }

  if (!params.pattern && !params.content) {
    throw new Error(
      `Provide at least one of: pattern (filename glob) or content (text to search for).`
    );
  }

  const results: SearchMatch[] = [];
  searchFilesRecursive(
    searchRoot,
    searchRoot,
    params.pattern,
    params.content,
    caseSensitive,
    results
  );

  return {
    success: true,
    searchRoot: params.path ?? ".",
    pattern: params.pattern ?? null,
    content: params.content ?? null,
    caseSensitive,
    count: results.length,
    results,
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
    process.stdout.write(JSON.stringify({ error: "Invalid JSON input" }));
    process.exit(1);
  }

  try {
    let result: object;

    switch (input.action) {
      case "read_file":        result = readFile(input.params);        break;
      case "write_file":       result = writeFile(input.params);       break;
      case "append_file":      result = appendFile(input.params);      break;
      case "delete_file":      result = deleteFile(input.params);      break;
      case "rename_file":      result = renameFile(input.params);      break;
      case "move_file":        result = moveFile(input.params);        break;
      case "copy_file":        result = copyFile(input.params);        break;
      case "file_info":        result = fileInfo(input.params);        break;
      case "list_files":       result = listFiles(input.params);       break;
      case "create_directory": result = createDirectory(input.params); break;
      case "delete_directory": result = deleteDirectory(input.params); break;
      case "search_files":     result = searchFiles(input.params);     break;
      default:
        result = {
          error: `Unknown action: ${(input as SkillInput).action}`,
          supported: [
            "read_file", "write_file", "append_file", "delete_file",
            "rename_file", "move_file", "copy_file", "file_info",
            "list_files", "create_directory", "delete_directory", "search_files",
          ],
        };
    }

    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isSecurityViolation = message.startsWith("Security violation");

    process.stdout.write(
      JSON.stringify({
        error: true,
        securityViolation: isSecurityViolation,
        message,
        suggestion: isSecurityViolation
          ? "All file operations must stay within the /workspace directory."
          : "Check the file path and permissions.",
      })
    );
    process.exit(1);
  }
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ error: String(err) }));
  process.exit(1);
});
