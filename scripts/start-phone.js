const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const QRCode = require("qrcode");
const qrcode = require("qrcode-terminal");
const { bridgeKeyForRequest, shouldDisposeIdleBridge, shouldPromoteBridgeKey } = require("./bridge-state");
const { startQuickTunnel } = require("./cloudflared-tunnel");
const { isHistorySyncEnabled, runHistorySync } = require("./history-sync");
const { notifyBridgeUrls } = require("./phone-notify");
const { SessionStore } = require("./session-store");

const root = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile(path.join(root, ".env"));

const codexBin = path.join(root, "node_modules", ".bin", "codex");
const codexJsBin = path.join(root, "node_modules", "@openai", "codex", "bin", "codex.js");
const uiPort = Number(process.env.PHONE_UI_PORT || 45214);
const codexPort = Number(process.env.CODEX_APP_SERVER_PORT || 45213);
const codexSocketPath = process.env.CODEX_APP_SERVER_SOCK || "";
const codexUrl = process.env.CODEX_APP_SERVER_URL || (codexSocketPath ? "ws://codex-app-server/rpc" : `ws://127.0.0.1:${codexPort}`);
const shouldStartCodexServer = !process.env.CODEX_APP_SERVER_URL && !codexSocketPath;
const workdir = process.env.CODEX_WORKDIR || root;
const model = process.env.CODEX_MODEL || "gpt-5.4";
const historySyncEnabled = isHistorySyncEnabled(process.env);
const publicTunnelEnabled =
  process.argv.includes("--tunnel") ||
  /^(1|true|yes)$/i.test(String(process.env.PHONE_PUBLIC_TUNNEL || ""));
const productMode = /^(1|true|yes)$/i.test(String(process.env.PHONE_PRODUCT_MODE || ""));
const stablePublicUrl = String(process.env.PHONE_PUBLIC_URL || "").trim();
const bindHost = process.env.PHONE_BIND_HOST || "127.0.0.1";
const tokenPath = path.join(root, ".phone-token");
const uploadDir = path.join(root, ".uploads");
const screenCaptureDir = path.join(root, "tmp", "screen-captures");
const store = new SessionStore(path.join(root, "tmp", "phone-state", "state.json"));
const bridges = new Map();
const historyLimit = 80;
let managedCodexChild = null;
let activeWorkflowName = "";
const imageExtensions = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);
const staticMimeTypes = new Map([
  [".css", "text/css"],
  [".html", "text/html"],
  [".js", "application/javascript"],
  [".json", "application/json"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
]);

function getToken() {
  if (process.env.PHONE_TOKEN) return process.env.PHONE_TOKEN;
  if (fs.existsSync(tokenPath)) return fs.readFileSync(tokenPath, "utf8").trim();
  const token = crypto.randomBytes(18).toString("base64url");
  fs.writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
  return token;
}

function waitForReady() {
  const url = `http://127.0.0.1:${codexPort}/readyz`;
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const retry = () => {
      if (Date.now() - started > 10_000) reject(new Error("Codex app-server did not become ready"));
      else setTimeout(tick, 250);
    };
    const tick = () => {
      http
        .get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        })
        .on("error", retry);
    };
    tick();
  });
}

function createUpstreamWebSocket() {
  if (!codexSocketPath) return new WebSocket(codexUrl);
  return new WebSocket(codexUrl, {
    perMessageDeflate: false,
    createConnection: () => net.createConnection(codexSocketPath),
  });
}

class AppServerRpcClient {
  constructor() {
    this.upstream = null;
    this.nextId = 1;
    this.pending = new Map();
    this.ready = false;
    this.connecting = null;
  }

  request(method, params) {
    return this.ensureReady().then(() => this.sendRequest(method, params));
  }

  ensureReady() {
    if (this.ready && this.upstream?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.upstream = createUpstreamWebSocket();
    this.ready = false;
    this.connecting = new Promise((resolve, reject) => {
      const fail = (error) => {
        this.connecting = null;
        reject(error);
      };

      this.upstream.on("open", () => {
        this.sendRequest("initialize", {
          clientInfo: { name: "codex-phone-bridge-api", title: "Codex Phone Bridge API", version: "0.1.0" },
        })
          .then(() => {
            if (this.upstream?.readyState === WebSocket.OPEN) {
              this.upstream.send(JSON.stringify({ method: "initialized", params: {} }));
            }
            this.ready = true;
            this.connecting = null;
            resolve();
          })
          .catch(fail);
      });

      this.upstream.on("message", (data) => this.handleMessage(data));
      this.upstream.on("error", fail);
      this.upstream.on("close", () => this.reset(new Error("Codex app-server connection closed")));
    });

    return this.connecting;
  }

  sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.upstream || this.upstream.readyState !== WebSocket.OPEN) {
        reject(new Error("Codex app-server connection is not open"));
        return;
      }
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 8000);
      this.pending.set(id, { method, resolve, reject, timeout });
      this.upstream.send(JSON.stringify({ id, method, params }));
    });
  }

  handleMessage(data) {
    const msg = JSON.parse(data.toString());
    if (!msg.id || !this.pending.has(msg.id)) return;
    const pending = this.pending.get(msg.id);
    this.pending.delete(msg.id);
    clearTimeout(pending.timeout);
    if (msg.error) pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else pending.resolve(msg.result);
  }

  reset(error) {
    this.ready = false;
    this.connecting = null;
    this.upstream = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

const appServerClient = new AppServerRpcClient();

function startCodexServer() {
  const command = process.platform === "win32" ? process.execPath : codexBin;
  const args = process.platform === "win32" ? [codexJsBin, "app-server", "--listen", codexUrl] : ["app-server", "--listen", codexUrl];
  const child = spawn(command, args, {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${path.join(root, "node_modules", ".bin")}${path.delimiter}${process.env.PATH || ""}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[codex] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[codex] ${chunk}`));
  child.on("error", (error) => {
    console.error(`[codex] failed to start: ${error.message}`);
  });
  child.on("exit", (code, signal) => {
    console.error(`[codex] exited code=${code} signal=${signal}`);
  });
  process.on("SIGINT", () => {
    child.kill("SIGINT");
    process.exit(0);
  });
  return child;
}

function stopChildProcess(child, signal = "SIGINT", timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      done();
    }, timeoutMs);
    child.once("exit", done);
    try {
      child.kill(signal);
    } catch {
      done();
    }
  });
}

async function restartManagedCodexServer() {
  if (!shouldStartCodexServer) return;
  await stopChildProcess(managedCodexChild);
  managedCodexChild = startCodexServer();
  await waitForReady();
}

function tokenizedUrl(baseUrl, phoneToken) {
  const url = new URL(baseUrl);
  url.searchParams.set("token", phoneToken);
  return url.toString();
}

function accessUrlCandidates({ publicUrl = "", phoneToken }) {
  const candidates = [];
  if (stablePublicUrl) candidates.push(tokenizedUrl(stablePublicUrl, phoneToken));
  if (publicUrl) candidates.push(tokenizedUrl(publicUrl, phoneToken));
  return [...new Set(candidates.filter(Boolean))];
}

function printQrAccessCard(accessUrl, phoneToken) {
  const connectionTextPath = path.join(root, "connection.txt");
  const connectionHtmlPath = path.join(root, "connection.html");
  const qrPngPath = path.join(root, "connection-qr-latest.png");
  fs.writeFileSync(
    connectionTextPath,
    [
      `URL: ${accessUrl}`,
      `TOKEN: ${phoneToken}`,
      "",
      "Keep the start window open while using this URL.",
      stablePublicUrl
        ? "URL is configured from PHONE_PUBLIC_URL and should stay stable across updates."
        : "This is an outside-access tunnel URL. It may change when the bridge restarts.",
    ].join("\n"),
    "utf8",
  );
  QRCode.toFile(qrPngPath, accessUrl, { margin: 2, width: 640 }, () => {});
  QRCode.toString(accessUrl, { type: "svg", margin: 2, width: 320 }, (error, svg) => {
    const qrMarkup = error ? `<p>QR generation failed: ${escapeHtml(error.message)}</p>` : svg;
    fs.writeFileSync(
      connectionHtmlPath,
      [
        "<!doctype html>",
        '<html lang="ja">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>Codex Remote Access</title>",
        "<style>",
        "body{font-family:system-ui,sans-serif;margin:32px;line-height:1.6;background:#f7f7f8;color:#111}",
        "main{max-width:720px;margin:auto;background:#fff;padding:28px;border-radius:12px;box-shadow:0 8px 32px #0001}",
        "a{font-size:18px;word-break:break-all}.qr{margin:24px 0}",
        ".url-card{margin:16px 0;padding:14px;border:1px solid #e5e5e5;border-radius:10px;background:#fafafa}",
        ".label{display:inline-block;margin-bottom:6px;color:#666;font-size:13px;font-weight:700}",
        "code{background:#f1f1f3;padding:3px 6px;border-radius:6px}",
        "</style>",
        "</head>",
        "<body><main>",
        "<h1>Codex Remote Access</h1>",
        "<p>Scan this QR code from your phone. This URL is for outside access.</p>",
        `<div class="qr">${qrMarkup}</div>`,
        `<div class="url-card"><span class="label">Outside access URL</span><br><a href="${escapeHtml(accessUrl)}">${escapeHtml(accessUrl)}</a></div>`,
        `<p><strong>Token:</strong> <code>${escapeHtml(phoneToken)}</code></p>`,
        "<p>Keep this URL and token private.</p>",
        "</main></body></html>",
      ].join("\n"),
      "utf8",
    );
  });
  console.log("");
  console.log("=========================================");
  console.log("Scan this QR code from your phone.");
  console.log("");
  qrcode.generate(accessUrl, { small: true }, (qr) => console.log(qr));
  console.log("");
  console.log(`URL: ${accessUrl}`);
  console.log(`Token: ${phoneToken}`);
  console.log(`URL file: ${connectionTextPath}`);
  console.log(`QR page: ${connectionHtmlPath}`);
  console.log(`QR png: ${qrPngPath}`);
  console.log("=========================================");
  console.log("");

  notifyBridgeUrls([accessUrl]).then((results) => {
    for (const result of results) {
      if (result.ok) console.log(`[notify] sent via ${result.type}`);
      else console.warn(`[notify] ${result.type} failed: ${result.error}`);
    }
  });
}
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appServerRequest(method, params) {
  return appServerClient.request(method, params);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function requireToken(url, phoneToken, res) {
  if (url.searchParams.get("token") === phoneToken) return true;
  sendJson(res, 401, { error: "invalid token" });
  return false;
}

function safeRelativePath(input, baseDir = root) {
  const raw = String(input || "");
  const target = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(baseDir, raw.replace(/^[/\\]+/, ""));
  if (!target.startsWith(`${baseDir}${path.sep}`) && target !== baseDir) return null;
  return target;
}

function safeUploadPath(input) {
  const clean = String(input || "").replace(/^[/\\]+/, "");
  const target = path.resolve(uploadDir, clean);
  if (!target.startsWith(`${uploadDir}${path.sep}`) && target !== uploadDir) return null;
  return target;
}

function relativeFromBase(target, baseDir = root) {
  return path.relative(baseDir, target).replace(/\\/g, "/");
}

function isBlockedFolderEntry(name) {
  const clean = String(name || "").toLowerCase();
  return (
    (clean.startsWith(".") && clean !== ".github") ||
    clean === ".git" ||
    clean === "node_modules" ||
    clean === "__pycache__" ||
    clean === ".uploads" ||
    clean.startsWith(".codex-home")
  );
}

function isBlockedFileEntry(name) {
  const clean = String(name || "").toLowerCase();
  return (
    clean === ".phone-token" ||
    clean.startsWith(".env") ||
    clean.includes("secret") ||
    clean.includes("credential") ||
    clean.includes("token") ||
    clean.endsWith(".db") ||
    clean.endsWith(".sqlite") ||
    clean.endsWith(".sqlite3")
  );
}

function isSafeBrowsablePath(target, baseDir = root) {
  const relative = relativeFromBase(target, baseDir);
  if (!relative || relative === ".") return true;
  const parts = relative.split("/").filter(Boolean);
  const isDirectory = fs.existsSync(target) && fs.statSync(target).isDirectory();
  return parts.every((part, index) => {
    const isLast = index === parts.length - 1;
    if (!isLast || isDirectory) return !isBlockedFolderEntry(part);
    return !isBlockedFileEntry(part);
  });
}

function mimeForPath(filePath) {
  return imageExtensions.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
}

function isImagePath(filePath) {
  return imageExtensions.has(path.extname(filePath).toLowerCase());
}

function isTextLikePath(filePath) {
  return /\.(md|mdown|txt|json|js|mjs|cjs|ts|tsx|jsx|css|html|xml|svg|yml|yaml|toml|ps1|py|sh|bat|cmd|gitignore|dockerignore)$/i.test(
    filePath,
  );
}

function listFolderEntries(baseDir, folderPath = "") {
  const targetDir = safeRelativePath(folderPath || ".", baseDir);
  if (!targetDir || !fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory() || !isSafeBrowsablePath(targetDir, baseDir)) {
    throw new Error("folder not found");
  }
  const entries = fs
    .readdirSync(targetDir, { withFileTypes: true })
    .filter((entry) => {
      if (entry.isDirectory()) return !isBlockedFolderEntry(entry.name);
      if (entry.isFile()) return !isBlockedFileEntry(entry.name);
      return false;
    })
    .map((entry) => {
      const full = path.join(targetDir, entry.name);
      const stat = fs.statSync(full);
      const relative = relativeFromBase(full, baseDir);
      return {
        name: entry.name,
        path: relative,
        kind: entry.isDirectory() ? "folder" : isImagePath(full) ? "image" : isTextLikePath(full) ? "text" : "file",
        size: entry.isFile() ? stat.size : null,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => {
      if (a.kind === "folder" && b.kind !== "folder") return -1;
      if (a.kind !== "folder" && b.kind === "folder") return 1;
      return a.name.localeCompare(b.name, "ja");
    });
  return {
    path: relativeFromBase(targetDir, baseDir),
    parent: targetDir === baseDir ? "" : relativeFromBase(path.dirname(targetDir), baseDir),
    entries,
  };
}

async function resolveThreadCwd(threadId) {
  const clean = String(threadId || "").trim();
  if (!clean) return root;
  for (const bridge of bridges.values()) {
    if (bridge.threadId === clean && bridge.cwd) return bridge.cwd;
  }
  try {
    const result = await appServerRequest("thread/list", {
      limit: 100,
      sortKey: "updated_at",
      sortDirection: "desc",
      archived: false,
      useStateDbOnly: false,
    });
    const thread = (result.data || []).find((entry) => entry.id === clean);
    if (thread?.cwd && fs.existsSync(thread.cwd)) return thread.cwd;
  } catch {
    // ignore and fall back
  }
  return root;
}

function artifactBaseDir(threadCwd) {
  const cwd = String(threadCwd || "").trim();
  return cwd && fs.existsSync(cwd) ? cwd : root;
}

function resolveArtifactBaseFromUrl(url) {
  const rawCwd = String(url.searchParams.get("cwd") || "").trim();
  if (rawCwd) {
    const resolved = path.resolve(rawCwd);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
  }
  return null;
}

function discoverArtifacts(baseDir = root) {
  const files = [];
  const addArtifact = (relative) => {
    const normalized = relative.replace(/\\/g, "/");
    const full = path.join(baseDir, normalized);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return;
    if (!isImagePath(full) && !/\.md(?:own)?$/i.test(normalized)) return;
    if (!files.includes(normalized)) files.push(normalized);
  };
  const addDirectoryArtifacts = (relativeDir, limit = 24) => {
    const targetDir = path.join(baseDir, relativeDir);
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) return;
    const entries = fs
      .readdirSync(targetDir)
      .map((name) => {
        const full = path.join(targetDir, name);
        return { name, full, stat: fs.statSync(full) };
      })
      .filter((entry) => entry.stat.isFile())
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
      .slice(0, limit);
    for (const entry of entries) addArtifact(path.join(relativeDir, entry.name));
  };
  for (const name of ["README.md", "AGENTS.md"]) {
    const target = path.join(baseDir, name);
    if (fs.existsSync(target) && fs.statSync(target).isFile()) files.push(name);
  }
  const assetsDir = path.join(baseDir, "docs", "assets");
  if (fs.existsSync(assetsDir)) {
    const assetNames = fs
      .readdirSync(assetsDir)
      .map((name) => ({
        name,
        full: path.join(assetsDir, name),
        stat: fs.statSync(path.join(assetsDir, name)),
      }))
      .filter((entry) => entry.stat.isFile() && (isImagePath(entry.full) || /\.md(?:own)?$/i.test(entry.name)))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
      .map((entry) => entry.name);
    for (const name of assetNames) {
      const relative = path.join("docs", "assets", name);
      const full = path.join(baseDir, relative);
      if (fs.statSync(full).isFile() && (isImagePath(full) || /\.md(?:own)?$/i.test(name))) files.push(relative);
    }
  }
  addDirectoryArtifacts(path.join("tmp", "screen-captures"));
  addDirectoryArtifacts(path.join("tmp", "generated-images"));
  addDirectoryArtifacts(path.join("tmp", "workflow-screenshots"));
  return files.map((file) => ({
    path: file.replace(/\\/g, "/"),
    name: path.basename(file),
    kind: isImagePath(file) ? "image" : /\.md(?:own)?$/i.test(file) ? "markdown" : "file",
  }));
}

function readAutomations() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const automationsDir = path.join(home, "automations");
  if (!fs.existsSync(automationsDir)) return [];
  const stringField = (raw, key) => {
    const value = raw.match(new RegExp(`^${key}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`, "m"))?.[1];
    if (value === undefined) return "";
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return value;
    }
  };
  const numberField = (raw, key) => Number(raw.match(new RegExp(`^${key}\\s*=\\s*(\\d+)`, "m"))?.[1] || 0);
  const arrayField = (raw, key) => {
    const match = raw.match(new RegExp(`^${key}\\s*=\\s*\\[(.*)\\]`, "m"));
    if (!match) return [];
    return [...match[1].matchAll(/"([^"]*)"/g)].map((item) => item[1]);
  };
  return fs
    .readdirSync(automationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const automationToml = path.join(automationsDir, entry.name, "automation.toml");
      const raw = fs.existsSync(automationToml) ? fs.readFileSync(automationToml, "utf8") : "";
      return {
        id: stringField(raw, "id") || entry.name,
        name: stringField(raw, "name") || entry.name,
        kind: stringField(raw, "kind") || "unknown",
        status: stringField(raw, "status") || "UNKNOWN",
        prompt: stringField(raw, "prompt"),
        rrule: stringField(raw, "rrule"),
        model: stringField(raw, "model"),
        reasoningEffort: stringField(raw, "reasoning_effort"),
        executionEnvironment: stringField(raw, "execution_environment"),
        targetThreadId: stringField(raw, "target_thread_id"),
        cwds: arrayField(raw, "cwds"),
        updatedAt: numberField(raw, "updated_at"),
      };
    });
}

function isAllowedPreviewUrl(rawUrl) {
  try {
    const target = new URL(rawUrl);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    return (target.protocol === "http:" || target.protocol === "https:") && localHosts.has(target.hostname);
  } catch {
    return false;
  }
}

function fetchPreviewTarget(rawUrl) {
  return new Promise((resolve, reject) => {
    if (!isAllowedPreviewUrl(rawUrl)) {
      reject(new Error("preview URL must be http(s)://localhost or 127.0.0.1"));
      return;
    }
    const target = new URL(rawUrl);
    const client = target.protocol === "https:" ? https : http;
    const req = client.get(target, { timeout: 8000 }, (upstream) => {
      const chunks = [];
      upstream.on("data", (chunk) => chunks.push(chunk));
      upstream.on("end", () => {
        resolve({
          statusCode: upstream.statusCode || 200,
          headers: upstream.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("timeout", () => req.destroy(new Error("preview request timed out")));
    req.on("error", reject);
  });
}

function rewritePreviewHtml(buffer, port) {
  const prefix = `/preview/${port}`;
  return buffer
    .toString("utf8")
    .replace(/<head(\s[^>]*)?>/i, (match) => `${match}<base href="${prefix}/">`)
    .replace(/\b(src|href|action)=["']\/(?!\/)([^"']*)["']/gi, (_match, attr, value) => {
      return `${attr}="${prefix}/${value}"`;
    });
}

function automationTomlPath(id) {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const automationsDir = path.join(home, "automations");
  const safeId = String(id || "").replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safeId || safeId !== id) return null;
  const target = path.join(automationsDir, safeId, "automation.toml");
  if (!target.startsWith(`${automationsDir}${path.sep}`)) return null;
  return target;
}

function replaceTomlString(raw, key, value) {
  const line = `${key} = ${JSON.stringify(String(value))}`;
  const re = new RegExp(`^${key}\\s*=\\s*"(?:\\\\.|[^"\\\\])*"`, "m");
  return re.test(raw) ? raw.replace(re, line) : `${raw.trimEnd()}\n${line}\n`;
}

function updateAutomationFile({ id, name, prompt, status, rrule, dailyTime, model, reasoningEffort }) {
  const target = automationTomlPath(id);
  if (!target || !fs.existsSync(target)) throw new Error("automation not found");
  let raw = fs.readFileSync(target, "utf8");

  if (name !== undefined) raw = replaceTomlString(raw, "name", name);
  if (prompt !== undefined) raw = replaceTomlString(raw, "prompt", prompt);
  if (model !== undefined) raw = replaceTomlString(raw, "model", model);
  if (reasoningEffort !== undefined) raw = replaceTomlString(raw, "reasoning_effort", reasoningEffort);

  if (status !== undefined) {
    const nextStatus = String(status).toUpperCase();
    if (!["ACTIVE", "PAUSED"].includes(nextStatus)) throw new Error("status must be ACTIVE or PAUSED");
    raw = replaceTomlString(raw, "status", nextStatus);
  }

  if (rrule !== undefined) {
    const nextRrule = String(rrule).trim();
    if (!nextRrule.startsWith("FREQ=")) throw new Error("rrule must start with FREQ=");
    raw = replaceTomlString(raw, "rrule", nextRrule);
  }

  if (dailyTime !== undefined) {
    const match = String(dailyTime).match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) throw new Error("dailyTime must be HH:MM");
    const hour = String(Number(match[1]));
    const minute = String(Number(match[2]));
    raw = replaceTomlString(raw, "rrule", `FREQ=DAILY;BYHOUR=${hour};BYMINUTE=${minute};BYSECOND=0`);
  }

  raw = /^updated_at\s*=\s*\d+/m.test(raw)
    ? raw.replace(/^updated_at\s*=\s*\d+/m, `updated_at = ${Date.now()}`)
    : `${raw.trimEnd()}\nupdated_at = ${Date.now()}\n`;
  fs.writeFileSync(target, raw, "utf8");
  return readAutomations().find((automation) => automation.id === id);
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 20_000) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function runLocalProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
  });
}

async function runWorkflowScript(scriptName, scriptArgs) {
  return runLocalProcess(process.execPath, [path.join(root, "scripts", scriptName), ...scriptArgs]);
}

async function captureDesktopScreenshot() {
  fs.mkdirSync(screenCaptureDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(screenCaptureDir, `pc-screen-${stamp}.png`);
  const scriptPath = path.join(root, "scripts", "capture-screen.ps1");
  if (!fs.existsSync(scriptPath)) throw new Error("capture-screen.ps1 is missing");
  const command = process.platform === "win32" ? "powershell.exe" : "pwsh";
  await runLocalProcess(command, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-OutputPath",
    outputPath,
  ]);
  if (!fs.existsSync(outputPath) || !fs.statSync(outputPath).isFile()) {
    throw new Error("screenshot file was not created");
  }
  return {
    absolutePath: outputPath,
    path: path.relative(root, outputPath).replace(/\\/g, "/"),
  };
}

function artifactUrlForPath(relativePath) {
  return `/api/file/raw?path=${encodeURIComponent(relativePath)}`;
}

function registerArtifact({ sessionId = "", type = "file", relativePath }) {
  if (!relativePath) return null;
  const existed = store.state.artifacts.some((item) => item.path === relativePath);
  const artifact = store.addArtifact(sessionId, {
    type,
    path: relativePath,
    url: artifactUrlForPath(relativePath),
  });
  if (!artifact) return null;
  if (!existed) {
    for (const bridge of bridges.values()) {
      if (!sessionId || bridge.threadId === sessionId) bridge.emit("artifact", { artifact });
    }
  }
  return artifact;
}

function registerDiscoveredArtifacts(baseDir = root, sessionId = "") {
  const registered = [];
  for (const item of discoverArtifacts(baseDir)) {
    const artifact = registerArtifact({
      sessionId,
      type: item.kind === "image" ? "image" : item.kind,
      relativePath: item.path,
    });
    if (artifact) registered.push(artifact);
  }
  return registered;
}

function parseWorkflowArtifacts(result = {}) {
  const stdout = String(result.stdout || "");
  const meta = {};
  for (const line of stdout.split(/\r?\n/)) {
    const draftMatch = line.match(/^DRAFT_COPY:(.+)$/);
    if (draftMatch) meta.draftCopyPath = draftMatch[1].trim();
    const screenshotMatch = line.match(/^SCREENSHOT:(.+)$/);
    if (screenshotMatch) meta.screenshotPath = screenshotMatch[1].trim();
  }
  return meta;
}

async function runExclusiveWorkflow(name, task) {
  if (activeWorkflowName) {
    throw new Error(`workflow already running: ${activeWorkflowName}`);
  }
  activeWorkflowName = name;
  try {
    return await task();
  } finally {
    activeWorkflowName = "";
  }
}

function saveDataUrlAttachment(attachment) {
  const match = String(attachment.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  if (!mime.startsWith("image/")) return null;
  fs.mkdirSync(uploadDir, { recursive: true });
  const extension = mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const safeName = String(attachment.name || "upload")
    .replace(/[^a-z0-9._-]/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
  const fileName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeName || "image"}.${extension}`;
  const target = path.join(uploadDir, fileName);
  fs.writeFileSync(target, Buffer.from(match[2], "base64"), { mode: 0o600 });
  return {
    input: { type: "localImage", path: target },
    preview: { name: attachment.name || fileName, path: fileName, url: `/api/uploaded?name=${encodeURIComponent(fileName)}` },
  };
}

function sandboxPolicyForMode(mode) {
  if (mode === "danger-full-access") return { type: "dangerFullAccess" };
  if (mode === "read-only") return { type: "readOnly", networkAccess: true };
  return {
    type: "workspaceWrite",
    writableRoots: [workdir],
    networkAccess: true,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const file = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const target = path.join(root, "public", file);
  if (!target.startsWith(path.join(root, "public")) || !fs.existsSync(target)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const type = staticMimeTypes.get(path.extname(target).toLowerCase()) || "application/octet-stream";
  res.writeHead(200, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
  fs.createReadStream(target).pipe(res);
}

function workflowTempDir() {
  const tempDir = path.join(root, "tmp", "api-workflows");
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function stripUiDirectives(text) {
  return String(text || "")
    .replace(/(?:^|\n)::[a-z0-9-]+\{[^\n]*\}(?=\n|$)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function summarizeItem(item) {
  if (item.type === "userMessage") {
    const textParts = [];
    const attachments = [];
    for (const part of item.content) {
      if (part.type === "text") {
        textParts.push(part.text);
        continue;
      }
      if (part.type === "localImage" && part.path) {
        const absolutePath = path.resolve(part.path);
        if (absolutePath.startsWith(`${uploadDir}${path.sep}`)) {
          attachments.push({
            name: path.basename(absolutePath),
            url: `/api/uploaded?name=${encodeURIComponent(path.basename(absolutePath))}`,
          });
        } else if (absolutePath.startsWith(`${root}${path.sep}`) && isImagePath(absolutePath)) {
          const relative = path.relative(root, absolutePath);
          attachments.push({ name: path.basename(absolutePath), url: `/api/file/raw?path=${encodeURIComponent(relative)}` });
        }
      }
    }
    return {
      type: "user",
      text: textParts.join("\n") || (attachments.length ? "添付画像" : ""),
      attachments,
    };
  }
  if (item.type === "agentMessage") return { type: "assistant", text: stripUiDirectives(item.text) };
  if (item.type === "commandExecution") return { type: "status", text: `$ ${item.command}` };
  if (item.type === "fileChange") return { type: "status", text: `file changes: ${item.status}` };
  return null;
}

function summarizeLiveItem(item, phase = "completed") {
  if (!item) return null;
  if (item.type === "commandExecution") {
    return phase === "started" ? `$ ${item.command}` : null;
  }
  if (item.type === "fileChange") {
    return `file changes: ${item.status}`;
  }
  return null;
}

function historyFromThread(thread) {
  const history = [];
  for (const turn of thread.turns || []) {
    for (const item of turn.items || []) {
      const entry = summarizeItem(item);
      if (entry && entry.text) history.push(entry);
    }
  }
  return capHistory(history);
}

function capHistory(history) {
  return history.slice(-historyLimit);
}

class SharedBridge {
  constructor(requestedThreadId, bridgeKey, deviceId = "") {
    this.requestedThreadId = requestedThreadId;
    this.bridgeKey = bridgeKey;
    this.deviceId = deviceId;
    this.clients = new Set();
    this.nextId = 1;
    this.pending = new Map();
    this.threadId = null;
    this.activeTurnId = null;
    this.pendingApproval = null;
    this.ready = false;
    this.history = [];
    this.turnQueue = [];
    this.upstream = null;
    this.suppressCloseStatus = false;
    this.openUpstream();
  }

  openUpstream() {
    this.upstream = createUpstreamWebSocket();
    this.bindUpstream(this.upstream);
  }

  addClient(browser, deviceId = "") {
    if (deviceId) {
      this.deviceId = deviceId;
      store.touchDevice(deviceId, { lastSessionId: this.threadId || this.requestedThreadId || "" });
    }
    this.clients.add(browser);
    this.emitTo(browser, "status", { text: "共有Codexブリッジに参加しました。" });
    if (this.ready) {
      this.emitTo(browser, "ready", this.readyPayload());
    }
    browser.on("close", () => {
      this.clients.delete(browser);
      if (shouldDisposeIdleBridge({ clientCount: this.clients.size, ready: this.ready })) {
        this.upstream.close();
        bridges.delete(this.bridgeKey);
      }
    });
  }

  readyPayload() {
    return {
      threadId: this.threadId,
      model,
      workdir,
      shared: true,
      clients: this.clients.size,
      history: this.history,
      session: this.threadId ? store.getSession(this.threadId) : null,
    };
  }

  emit(type, payload = {}) {
    const body = JSON.stringify({ type, ...payload });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(body);
    }
  }

  emitTo(client, type, payload = {}) {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type, ...payload }));
  }

  persistStatus(status, extra = {}) {
    if (!this.threadId) return;
    store.updateSession(this.threadId, {
      status,
      activeTurnId: this.activeTurnId || "",
      queued: this.turnQueue.length,
      ...extra,
    });
  }

  request(method, params) {
    const id = this.nextId++;
    this.upstream.send(JSON.stringify({ id, method, params }));
    return id;
  }

  hasPendingTurnStart() {
    return Array.from(this.pending.values()).includes("turn/start");
  }

  promoteBridgeKey() {
    if (!shouldPromoteBridgeKey({ bridgeKey: this.bridgeKey, threadId: this.threadId })) return;
    const previousKey = this.bridgeKey;
    if (bridges.has(this.threadId) && bridges.get(this.threadId) !== this) return;
    if (bridges.get(previousKey) !== this) return;
    this.bridgeKey = this.threadId;
    bridges.delete(previousKey);
    bridges.set(this.bridgeKey, this);
  }

  bindUpstream(upstream) {
    upstream.on("open", () => {
      if (this.upstream !== upstream) return;
      this.request("initialize", {
        clientInfo: { name: "codex-phone-bridge", title: "Codex Phone Bridge", version: "0.1.0" },
      });
      upstream.send(JSON.stringify({ method: "initialized", params: {} }));
      const resumeThreadId = this.threadId || this.requestedThreadId;
      const method = resumeThreadId ? "thread/resume" : "thread/start";
      const params = resumeThreadId
        ? {
            threadId: resumeThreadId,
            model,
            cwd: workdir,
            approvalPolicy: "on-request",
            sandbox: "workspace-write",
          }
        : {
            model,
            cwd: workdir,
            approvalPolicy: "on-request",
            sandbox: "workspace-write",
          };
      const id = this.request(method, params);
      this.pending.set(id, method);
      this.emit("status", { text: this.requestedThreadId ? "既存threadを再開中..." : "新しいthreadを開始中..." });
    });

    upstream.on("message", (data) => {
      if (this.upstream !== upstream) return;
      const msg = JSON.parse(data.toString());
      const pendingMethod = this.pending.get(msg.id);

      if (pendingMethod === "thread/start" || pendingMethod === "thread/resume") {
        this.pending.delete(msg.id);
        if (msg.error) {
          this.emit("error", { text: msg.error.message || JSON.stringify(msg.error) });
          return;
        }
        this.threadId = msg.result.thread.id;
        this.promoteBridgeKey();
        this.ready = true;
        this.history = historyFromThread(msg.result.thread);
        store.upsertSession(this.threadId, {
          threadId: this.threadId,
          workdir,
          model,
          status: "ready",
          history: this.history,
          activeTurnId: "",
          queued: this.turnQueue.length,
        });
        if (this.deviceId) store.touchDevice(this.deviceId, { lastSessionId: this.threadId });
        this.emit("ready", this.readyPayload());
        this.startNextQueuedTurn();
        if (this.requestedThreadId) this.emit("status", { text: `既存threadを再開しました: ${this.threadId}` });
        return;
      }

      if (pendingMethod === "turn/start") {
        this.pending.delete(msg.id);
        if (msg.error) {
          this.emit("error", { text: msg.error.message || JSON.stringify(msg.error) });
          this.startNextQueuedTurn();
        } else {
          this.activeTurnId = msg.result.turn.id;
          this.persistStatus("running", { activeTurnId: this.activeTurnId });
          this.emit("turn", { status: "started", turnId: this.activeTurnId });
        }
        return;
      }

      if (msg.method === "item/agentMessage/delta") {
        this.emit("assistantDelta", { text: msg.params.delta });
        return;
      }

      if (msg.method === "item/started") {
        const text = summarizeLiveItem(msg.params.item, "started");
        if (text) this.emit("status", { text });
        return;
      }

      if (msg.method === "item/completed") {
        const entry = summarizeItem(msg.params.item);
        if (entry && entry.type !== "user") this.appendHistory(entry);
        const text = summarizeLiveItem(msg.params.item, "completed");
        if (text) this.emit("status", { text });
        this.emit("event", { event: msg });
        return;
      }

      if (msg.method === "turn/completed") {
        this.activeTurnId = null;
        registerDiscoveredArtifacts(root, this.threadId);
        this.persistStatus("completed", { activeTurnId: "", history: this.history });
        this.emit("turn", { status: "completed", turnId: msg.params.turnId });
        this.syncHistory("turn completed");
        this.startNextQueuedTurn();
        return;
      }

      if (msg.method && msg.method.endsWith("/requestApproval")) {
        this.pendingApproval = msg;
        this.emit("approval", { request: msg });
        return;
      }

      if (msg.method === "error") {
        this.persistStatus("error", { lastError: msg.params.message || JSON.stringify(msg.params) });
        this.emit("error", { text: msg.params.message || JSON.stringify(msg.params) });
        return;
      }

      this.emit("event", { event: msg });
    });

    upstream.on("error", (error) => {
      if (this.upstream !== upstream) return;
      this.emit("error", { text: error.message });
    });
    this.upstream.on("close", () => this.emit("status", { text: "Codex接続が閉じました" }));
  }

  prompt(text, attachments = [], options = {}) {
    if (!this.threadId) {
      this.emit("error", { text: "Thread is not ready yet" });
      return;
    }
    if (this.activeTurnId || this.hasPendingTurnStart()) {
      this.turnQueue.push({ text, attachments, options });
      this.persistStatus("running", { queued: this.turnQueue.length });
      this.emit("status", { text: `Follow-up queued (${this.turnQueue.length} waiting)` });
      return;
    }
    this.startPrompt(text, attachments, options);
  }

  interrupt(text, attachments = [], options = {}) {
    if (!this.threadId) {
      this.emit("error", { text: "Thread is not ready yet" });
      return;
    }
    if (!this.activeTurnId && !this.hasPendingTurnStart()) {
      this.startPrompt(text, attachments, options);
      return;
    }
    this.turnQueue.unshift({ text, attachments, options });
    this.persistStatus("running", { queued: this.turnQueue.length });
    this.emit("status", { text: "Interrupt requested. Stopping current run..." });
    this.stop({ preserveQueue: true, reason: "interrupt" });
  }

  startNextQueuedTurn() {
    if (!this.ready || this.activeTurnId || this.hasPendingTurnStart() || !this.turnQueue.length) return;
    const next = this.turnQueue.shift();
    this.emit("status", { text: `Starting queued follow-up (${this.turnQueue.length} remaining)` });
    this.startPrompt(next.text, next.attachments, next.options);
  }

  syncHistory(reason) {
    if (!this.threadId || !historySyncEnabled) return;
    runHistorySync({
      threadId: this.threadId,
      workdir,
      request: appServerRequest,
      enabled: historySyncEnabled,
    })
      .then((result) => {
        if (!result.skipped) this.emit("status", { text: `履歴同期を更新しました (${reason})` });
      })
      .catch((error) => {
        this.emit("status", { text: `履歴同期に失敗しました: ${error.message}` });
      });
  }

  startPrompt(text, attachments = [], options = {}) {
    const input = [{ type: "text", text, text_elements: [] }];
    const savedImages = [];
    for (const attachment of attachments || []) {
      const saved = saveDataUrlAttachment(attachment);
      if (saved) {
        input.push(saved.input);
        savedImages.push(saved.preview);
      }
    }
    const params = {
      threadId: this.threadId,
      input,
    };
    if (options.model) params.model = options.model;
    if (options.approvalPolicy) params.approvalPolicy = options.approvalPolicy;
    if (options.sandboxMode) params.sandboxPolicy = sandboxPolicyForMode(options.sandboxMode);
    const id = this.request("turn/start", {
      ...params,
    });
    this.pending.set(id, "turn/start");
    const displayText = savedImages.length ? `${text}\n\n添付: ${savedImages.map((image) => image.name).join(", ")}` : text;
    this.appendHistory({ type: "user", text: displayText, attachments: savedImages });
    this.persistStatus("running", { queued: this.turnQueue.length });
    this.emit("user", { text: displayText, attachments: savedImages });
  }

  appendHistory(entry) {
    this.history.push(entry);
    this.history = capHistory(this.history);
    if (this.threadId) store.appendHistory(this.threadId, entry, historyLimit);
  }

  approval(requestMsg, decision) {
    if (!requestMsg || !requestMsg.id || !requestMsg.method) return;
    this.pendingApproval = null;
    const accept = decision === "accept";
    let result;
    if (requestMsg.method === "item/commandExecution/requestApproval") {
      result = { decision: accept ? "accept" : "decline" };
    } else if (requestMsg.method === "item/fileChange/requestApproval") {
      result = { decision: accept ? "accept" : "decline" };
    } else {
      result = accept ? { decision: "accept" } : { decision: "decline" };
    }
    this.upstream.send(JSON.stringify({ id: requestMsg.id, result }));
    this.emit("status", { text: accept ? "承認しました" : "拒否しました" });
  }
  stop({ preserveQueue = false, reason = "stop" } = {}) {
    const queuedCount = this.turnQueue.length;
    if (!preserveQueue) this.turnQueue = [];
    if (this.pendingApproval) {
      const request = this.pendingApproval;
      this.pendingApproval = null;
      this.approval(request, "decline");
    }
    const shouldReconnect = this.activeTurnId || this.hasPendingTurnStart();
    if (!shouldReconnect) {
      this.emit("status", {
        text: preserveQueue
          ? `Current run cleared. ${queuedCount} queued follow-up kept for restart.`
          : queuedCount
            ? `Cleared ${queuedCount} queued follow-up items`
            : "Nothing was running",
      });
      this.emit("turn", { status: "stopped" });
      this.persistStatus("stopped", { activeTurnId: "", queued: this.turnQueue.length });
      return;
    }
    this.emit("status", {
      text:
        reason === "interrupt"
          ? `Interrupting current run. ${queuedCount} queued follow-up ready.`
          : queuedCount
            ? `Stopping current run. Cleared ${queuedCount} queued follow-up items.`
            : "Stopping current run",
    });
    this.emit("turn", { status: "stopped" });
    this.persistStatus("stopped", { activeTurnId: "", queued: this.turnQueue.length });
    this.pending.clear();
    this.activeTurnId = null;
    this.ready = false;
    this.suppressCloseStatus = true;
    this.requestedThreadId = this.threadId || this.requestedThreadId;
    if (this.upstream && this.upstream.readyState < WebSocket.CLOSING) this.upstream.close();
    const reopen = () => this.openUpstream();
    if (shouldStartCodexServer) {
      this.emit("status", { text: "Restarting Codex app-server for a clean stop..." });
      restartManagedCodexServer()
        .then(reopen)
        .catch((error) => this.emit("error", { text: `Failed to restart after stop: ${error.message}` }));
      return;
    }
    reopen();
  }
}

function getBridge(threadId, connectionId = crypto.randomUUID(), deviceId = "") {
  if (!threadId) {
    for (const bridge of bridges.values()) {
      if (!bridge.requestedThreadId) return bridge;
    }
  }
  const key = bridgeKeyForRequest(threadId, connectionId);
  if (!bridges.has(key)) bridges.set(key, new SharedBridge(threadId, key, deviceId));
  return bridges.get(key);
}

function bindBrowser(browser, phoneToken, threadId, deviceId = "") {
  const bridge = getBridge(threadId, crypto.randomUUID(), deviceId);
  bridge.addClient(browser, deviceId);

  browser.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.token !== phoneToken) {
      bridge.emitTo(browser, "error", { text: "Invalid token" });
      browser.close();
      return;
    }
    if (msg.type === "prompt") bridge.prompt(msg.text, msg.attachments, msg.options);
    if (msg.type === "followup") bridge.prompt(msg.text, msg.attachments, msg.options);
    if (msg.type === "interrupt") bridge.interrupt(msg.text, msg.attachments, msg.options);
    if (msg.type === "approval") bridge.approval(msg.request, msg.decision);
    if (msg.type === "stop") bridge.stop();
  });
}

async function main() {
  const phoneToken = getToken();
  managedCodexChild = shouldStartCodexServer ? startCodexServer() : null;
  let tunnel = null;
  if (shouldStartCodexServer) {
    await waitForReady();
  } else {
    await appServerRequest("thread/loaded/list", { cursor: null, limit: 1 });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/preview/")) {
      if (!requireToken(url, phoneToken, res)) return;
      const match = url.pathname.match(/^\/preview\/(\d{2,5})(\/.*)?$/);
      if (!match) {
        sendJson(res, 400, { error: "preview path must be /preview/<port>/" });
        return;
      }
      const port = Number(match[1]);
      const previewPath = match[2] || "/";
      const target = new URL(`http://127.0.0.1:${port}${previewPath}`);
      for (const [key, value] of url.searchParams) {
        if (key !== "token") target.searchParams.append(key, value);
      }
      try {
        const upstream = await fetchPreviewTarget(target.toString());
        const contentType = upstream.headers["content-type"] || "application/octet-stream";
        if (/text\/html/i.test(contentType)) {
          res.writeHead(upstream.statusCode, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(rewritePreviewHtml(upstream.body, port));
          return;
        }
        res.writeHead(upstream.statusCode, {
          "content-type": contentType,
          "cache-control": "no-store",
        });
        res.end(upstream.body);
      } catch (error) {
        sendJson(res, 502, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/info") {
      sendJson(res, 200, {
        model,
        workdir,
        codexUrl,
        codexSocketPath: codexSocketPath || null,
        managedCodexServer: shouldStartCodexServer,
        tokenRequired: true,
        productMode,
        stablePublicUrl: stablePublicUrl || null,
        publicTunnelEnabled,
      });
      return;
    }
    if (url.pathname === "/api/device/register") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const body = req.method === "POST" ? await readRequestJson(req) : {};
        const device = store.ensureDevice(body.deviceId || url.searchParams.get("device") || "");
        sendJson(res, 200, { device, tokenRequired: true });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/session/current") {
      if (!requireToken(url, phoneToken, res)) return;
      const deviceId = url.searchParams.get("device") || "";
      const device = deviceId ? store.ensureDevice(deviceId) : null;
      const liveBridge =
        Array.from(bridges.values()).find((bridge) => bridge.deviceId === deviceId) ||
        Array.from(bridges.values()).find((bridge) => bridge.threadId && bridge.threadId === device?.lastSessionId) ||
        null;
      const current = store.currentForDevice(deviceId);
      sendJson(res, 200, {
        ...current,
        device: device || current.device,
        pcOnline: true,
        live: liveBridge
          ? {
              threadId: liveBridge.threadId,
              ready: liveBridge.ready,
              active: Boolean(liveBridge.activeTurnId || liveBridge.hasPendingTurnStart()),
              queued: liveBridge.turnQueue.length,
              clients: liveBridge.clients.size,
            }
          : null,
      });
      return;
    }
    if (url.pathname === "/api/threads") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const result = await appServerRequest("thread/list", {
          limit: 30,
          sortKey: "updated_at",
          sortDirection: "desc",
          archived: false,
          useStateDbOnly: false,
        });
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/models") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const result = await appServerRequest("model/list", { limit: 80, includeHidden: false });
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/plugins") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const result = await appServerRequest("plugin/list", { cwds: [workdir] });
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/config") {
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const [config, auth] = await Promise.allSettled([
          appServerRequest("config/read", { includeLayers: false, cwd: workdir }),
          appServerRequest("getAuthStatus", {}),
        ]);
        sendJson(res, 200, {
          config: config.status === "fulfilled" ? config.value : null,
          auth: auth.status === "fulfilled" ? auth.value : null,
          errors: [config, auth]
            .filter((result) => result.status === "rejected")
            .map((result) => result.reason.message),
        });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/status") {
      if (!requireToken(url, phoneToken, res)) return;
      const [auth, config] = await Promise.allSettled([
        appServerRequest("getAuthStatus", {}),
        appServerRequest("config/read", { includeLayers: false, cwd: workdir }),
      ]);
      sendJson(res, 200, {
        workdir,
        model,
        auth: auth.status === "fulfilled" ? auth.value : null,
        config: config.status === "fulfilled" ? config.value : null,
        statusErrors: [auth, config]
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason.message),
        codexUrl,
        codexSocketPath: codexSocketPath || null,
        managedCodexServer: shouldStartCodexServer,
        historySyncEnabled,
        uiPort,
        codexPort,
        bridges: Array.from(bridges.values()).map((bridge) => ({
          threadId: bridge.threadId,
          clients: bridge.clients.size,
          ready: bridge.ready,
          active: Boolean(bridge.activeTurnId || bridge.hasPendingTurnStart()),
          queued: bridge.turnQueue.length,
        })),
      });
      return;
    }
    if (url.pathname === "/api/preview") {
      if (!requireToken(url, phoneToken, res)) return;
      const targetUrl = url.searchParams.get("url") || "";
      try {
        const upstream = await fetchPreviewTarget(targetUrl);
        const contentType = upstream.headers["content-type"] || "application/octet-stream";
        res.writeHead(upstream.statusCode, {
          "content-type": contentType,
          "cache-control": "no-store",
          "x-frame-options": "SAMEORIGIN",
        });
        res.end(upstream.body);
      } catch (error) {
        sendJson(res, 502, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/history-sync") {
      if (!requireToken(url, phoneToken, res)) return;
      const threadId = url.searchParams.get("thread");
      if (!threadId) {
        sendJson(res, 400, { error: "thread is required" });
        return;
      }
      try {
        const result = await runHistorySync({
          threadId,
          workdir,
          request: appServerRequest,
          enabled: historySyncEnabled,
        });
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/thread") {
      if (!requireToken(url, phoneToken, res)) return;
      const threadId = url.searchParams.get("thread");
      if (!threadId) {
        sendJson(res, 400, { error: "thread is required" });
        return;
      }
      try {
        let thread;
        try {
          const result = await appServerRequest("thread/read", {
            threadId,
            includeTurns: true,
          });
          thread = result.thread || result;
        } catch (readError) {
          const result = await appServerRequest("thread/resume", {
            threadId,
            model,
            cwd: workdir,
            approvalPolicy: "on-request",
            sandbox: "workspace-write",
          });
          thread = result.thread;
        }
        sendJson(res, 200, { threadId: thread.id || threadId, history: historyFromThread(thread) });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/automations") {
      if (!requireToken(url, phoneToken, res)) return;
      sendJson(res, 200, { data: readAutomations() });
      return;
    }
    if (url.pathname === "/api/automation/update") {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const body = await readRequestJson(req);
        const automation = updateAutomationFile(body);
        sendJson(res, 200, { ok: true, automation, data: readAutomations() });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/workflows/x-post") {
      if (productMode) {
        sendJson(res, 404, { error: "personal workflows are disabled in product mode" });
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const result = await runExclusiveWorkflow("x-post", async () => {
          const body = await readRequestJson(req);
          const account = String(body.account || "main").trim();
          const text = String(body.text || "");
          const quoteUrl = String(body.quoteUrl || "").trim();
          const draftOnly = Boolean(body.draftOnly);
          if (!text.trim()) {
            throw new Error("text is required");
          }
          const tempDir = workflowTempDir();
          const textFile = path.join(tempDir, `x-post-${Date.now()}.txt`);
          fs.writeFileSync(textFile, text, "utf8");
          const args = [
            "post",
            "--existing",
            "--uia-fallback",
            "--hotkey-fallback",
            "--account",
            account,
            "--text-file",
            textFile,
          ];
          if (quoteUrl) {
            args.push("--quote-url", quoteUrl);
            args.push("--bootstrap");
          }
          if (draftOnly) args.push("--dry-run");
          return runWorkflowScript("x-publisher.js", args);
        });
        sendJson(res, 200, { ok: true, stdout: result.stdout, stderr: result.stderr, ...parseWorkflowArtifacts(result) });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/workflows/x-article") {
      if (productMode) {
        sendJson(res, 404, { error: "personal workflows are disabled in product mode" });
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const result = await runExclusiveWorkflow("x-article", async () => {
          const body = await readRequestJson(req);
          const account = String(body.account || "main").trim();
          const title = String(body.title || "");
          const content = String(body.body || "");
          const draftOnly = Boolean(body.draftOnly);
          if (!title.trim() && !content.trim()) {
            throw new Error("title or body is required");
          }
          const tempDir = workflowTempDir();
          const titleFile = path.join(tempDir, `x-article-title-${Date.now()}.txt`);
          const bodyFile = path.join(tempDir, `x-article-body-${Date.now()}.md`);
          fs.writeFileSync(titleFile, title, "utf8");
          fs.writeFileSync(bodyFile, content, "utf8");
          const args = [
            "publish",
            "--existing",
            "--bootstrap",
            "--account",
            account,
            "--title-file",
            titleFile,
            "--body-file",
            bodyFile,
          ];
          if (draftOnly) args.push("--dry-run");
          return runWorkflowScript("x-article.js", args);
        });
        sendJson(res, 200, { ok: true, stdout: result.stdout, stderr: result.stderr, ...parseWorkflowArtifacts(result) });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/workflows/note-draft") {
      if (productMode) {
        sendJson(res, 404, { error: "personal workflows are disabled in product mode" });
        return;
      }
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const result = await runExclusiveWorkflow("note-draft", async () => {
          const body = await readRequestJson(req);
          const account = String(body.account || "main").trim();
          const title = String(body.title || "");
          const content = String(body.body || "");
          if (!title.trim() && !content.trim()) {
            throw new Error("title or body is required");
          }
          const tempDir = workflowTempDir();
          const titleFile = path.join(tempDir, `note-title-${Date.now()}.txt`);
          const bodyFile = path.join(tempDir, `note-body-${Date.now()}.md`);
          fs.writeFileSync(titleFile, title, "utf8");
          fs.writeFileSync(bodyFile, content, "utf8");
          return runWorkflowScript("note-draft.js", [
            "save",
            "--account",
            account,
            "--title-file",
            titleFile,
            "--body-file",
            bodyFile,
          ]);
        });
        sendJson(res, 200, { ok: true, stdout: result.stdout, stderr: result.stderr, ...parseWorkflowArtifacts(result) });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/screen/capture") {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "method not allowed" });
        return;
      }
      if (!requireToken(url, phoneToken, res)) return;
      try {
        const result = await captureDesktopScreenshot();
        const sessionId = url.searchParams.get("thread") || "";
        const artifact = registerArtifact({ sessionId, type: "screenshot", relativePath: result.path });
        sendJson(res, 200, {
          ok: true,
          path: result.path,
          kind: "image",
          mimeType: "image/png",
          imageUrl: artifact?.url || artifactUrlForPath(result.path),
          artifact,
        });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/artifacts") {
      if (!requireToken(url, phoneToken, res)) return;
      const baseDir = resolveArtifactBaseFromUrl(url) || artifactBaseDir(await resolveThreadCwd(url.searchParams.get("thread")));
      sendJson(res, 200, { data: discoverArtifacts(baseDir), baseDir });
      return;
    }
    if (url.pathname === "/api/files") {
      if (!requireToken(url, phoneToken, res)) return;
      const baseDir = resolveArtifactBaseFromUrl(url) || artifactBaseDir(await resolveThreadCwd(url.searchParams.get("thread")));
      try {
        const result = listFolderEntries(baseDir, url.searchParams.get("path") || "");
        sendJson(res, 200, { ...result, baseDir });
      } catch (error) {
        sendJson(res, 404, { error: error.message });
      }
      return;
    }
    if (url.pathname === "/api/uploaded") {
      if (!requireToken(url, phoneToken, res)) return;
      const target = safeUploadPath(url.searchParams.get("name"));
      if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile() || !isImagePath(target)) {
        sendJson(res, 404, { error: "image not found" });
        return;
      }
      res.writeHead(200, { "content-type": mimeForPath(target), "cache-control": "no-store" });
      fs.createReadStream(target).pipe(res);
      return;
    }
    if (url.pathname === "/api/file/raw") {
      if (!requireToken(url, phoneToken, res)) return;
      const baseDir = resolveArtifactBaseFromUrl(url) || artifactBaseDir(await resolveThreadCwd(url.searchParams.get("thread")));
      const target = safeRelativePath(url.searchParams.get("path"), baseDir);
      if (!target || !isSafeBrowsablePath(target, baseDir) || !fs.existsSync(target) || !fs.statSync(target).isFile() || !isImagePath(target)) {
        sendJson(res, 404, { error: "image not found" });
        return;
      }
      res.writeHead(200, { "content-type": mimeForPath(target), "cache-control": "no-store" });
      fs.createReadStream(target).pipe(res);
      return;
    }
    if (url.pathname === "/api/file") {
      if (!requireToken(url, phoneToken, res)) return;
      const baseDir = resolveArtifactBaseFromUrl(url) || artifactBaseDir(await resolveThreadCwd(url.searchParams.get("thread")));
      const target = safeRelativePath(url.searchParams.get("path"), baseDir);
      if (!target || !isSafeBrowsablePath(target, baseDir) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        sendJson(res, 404, { error: "file not found" });
        return;
      }
      if (isImagePath(target)) {
        sendJson(res, 200, {
          path: path.relative(baseDir, target).replace(/\\/g, "/"),
          kind: "image",
          mimeType: mimeForPath(target),
          imageUrl: `/api/file/raw?path=${encodeURIComponent(path.relative(baseDir, target).replace(/\\/g, "/"))}&thread=${encodeURIComponent(url.searchParams.get("thread") || "")}&cwd=${encodeURIComponent(baseDir)}`,
        });
        return;
      }
      if (!isTextLikePath(target)) {
        sendJson(res, 415, { error: "file preview is not supported for this file type" });
        return;
      }
      sendJson(res, 200, {
        path: path.relative(baseDir, target).replace(/\\/g, "/"),
        kind: /\.md(?:own)?$/i.test(target) ? "markdown" : "text",
        text: fs.readFileSync(target, "utf8").slice(0, 80_000),
      });
      return;
    }
    serveStatic(req, res);
  });

  const wss = new WebSocket.Server({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== "/bridge") {
      socket.destroy();
      return;
    }
    if (url.searchParams.get("token") !== phoneToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const threadId = url.searchParams.get("thread") || null;
    const deviceId = url.searchParams.get("device") || "";
    if (deviceId) store.ensureDevice(deviceId);
    wss.handleUpgrade(req, socket, head, (ws) => bindBrowser(ws, phoneToken, threadId, deviceId));
  });

  server.listen(uiPort, bindHost, () => {
    const firstAccessUrl =
      accessUrlCandidates({ phoneToken })[0] || `http://127.0.0.1:${uiPort}/?token=${encodeURIComponent(phoneToken)}`;
    console.log("");
    console.log("Codex shared browser bridge is ready.");
    console.log("");
    console.log(`Workdir: ${workdir}`);
    console.log(`Model:   ${model}`);
    console.log(`Codex:   ${shouldStartCodexServer ? codexUrl : codexSocketPath || codexUrl}`);
    console.log(`Mode:    ${productMode ? "product" : "personal"}`);
    console.log(`Bind:    ${bindHost}:${uiPort}`);
    if (stablePublicUrl) console.log(`Fixed public URL: ${stablePublicUrl}`);
    console.log("Open the QR URL from the phone to share one bridge thread.");
    if (stablePublicUrl) {
      printQrAccessCard(firstAccessUrl, phoneToken);
    } else if (publicTunnelEnabled) {
      console.log("Opening a TryCloudflare Quick Tunnel for outside access...");
      tunnel = startQuickTunnel({
        localUrl: `http://127.0.0.1:${uiPort}`,
        onUrl: (publicUrl) => {
          const accessUrls = accessUrlCandidates({ publicUrl, phoneToken });
          printQrAccessCard(accessUrls[0], phoneToken);
        },
      });
    } else {
      console.log("Public tunnel is off. This local URL is only for this PC. Run with --tunnel or PHONE_PUBLIC_TUNNEL=1 for phone access.");
      printQrAccessCard(firstAccessUrl, phoneToken);
    }
    console.log("Press Ctrl+C to stop.");
  });

  process.on("exit", () => {
    if (managedCodexChild) managedCodexChild.kill("SIGINT");
    if (tunnel) tunnel.kill("SIGINT");
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
