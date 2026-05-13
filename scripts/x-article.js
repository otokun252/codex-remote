const fs = require("fs");
const path = require("path");
const os = require("os");
const net = require("net");
const http = require("http");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const { openUrlInReusableTab } = require("./chrome-tab-reuse");

const root = path.resolve(__dirname, "..");
const localAppData =
  process.env.LOCALAPPDATA ||
  process.env.APPDATA ||
  path.join(os.homedir(), "AppData", "Local");
const chromeUserDataDir =
  process.env.CHROME_USER_DATA_DIR ||
  path.join(localAppData, "Google", "Chrome", "User Data");
const defaultChromeExe =
  process.env.CHROME_EXE ||
  path.join(
    process.env.ProgramFiles || "C:\\Program Files",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe",
  );
const defaultChromeExeX86 = path.join(
  process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
  "Google",
  "Chrome",
  "Application",
  "chrome.exe",
);
const accountConfigPath =
  process.env.X_ACCOUNTS_FILE ||
  path.join(root, "config", "x-accounts.local.json");
const articleRoot = path.join(root, "tmp", "x-articles");
const defaultXLang = process.env.X_UI_LANG || "en";
const workflowScreenshotRoot = path.join(root, "tmp", "workflow-screenshots");

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) {
      args._.push(part);
      continue;
    }
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function detectChromeExe() {
  if (fs.existsSync(defaultChromeExe)) return defaultChromeExe;
  if (fs.existsSync(defaultChromeExeX86)) return defaultChromeExeX86;
  throw new Error("Chrome executable not found.");
}

function loadAccountConfig() {
  if (!fs.existsSync(accountConfigPath)) return {};
  const raw = fs.readFileSync(accountConfigPath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function accountName(input) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) throw new Error("Missing --account");
  if (!/^[a-z0-9_-]+$/.test(value)) {
    throw new Error("Account must use only a-z, 0-9, underscore, or hyphen");
  }
  return value;
}

function accountMeta(account) {
  const config = loadAccountConfig();
  return config[account] || {};
}

function resolveHandle(account) {
  const meta = account ? accountMeta(account) : {};
  if (meta.handle) return meta.handle;
  return account || "";
}

function resolveChromeProfile(account, overrideProfile) {
  const meta = account ? accountMeta(account) : {};
  return overrideProfile || meta.chromeProfile || "Default";
}

function readTextArg(args, key, fileKey) {
  if (typeof args[key] === "string") return args[key];
  if (typeof args[fileKey] === "string") {
    return fs.readFileSync(path.resolve(args[fileKey]), "utf8");
  }
  return "";
}

function saveDraftCopy(account, title, body) {
  ensureDir(articleRoot);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(articleRoot, `${stamp}-${account}.md`);
  const content = title.trim() ? `# ${title.trim()}\n\n${body}` : body;
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function relativeToRoot(target) {
  return path.relative(root, target).replace(/\\/g, "/");
}

function isChromeRunning() {
  return new Promise((resolve) => {
    let command = "";
    let args = [];
    if (process.platform === "win32") {
      command = "tasklist";
      args = ["/FI", "IMAGENAME eq chrome.exe", "/FO", "CSV", "/NH"];
    } else if (process.platform === "darwin") {
      command = "pgrep";
      args = ["-x", "Google Chrome"];
    } else {
      command = "pgrep";
      args = ["-x", "chrome"];
    }
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("exit", () => {
      if (process.platform === "win32") {
        resolve(/chrome\.exe/i.test(stdout));
        return;
      }
      resolve(Boolean(stdout.trim()));
    });
    child.on("error", () => resolve(false));
  });
}

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function withXLang(url) {
  const parsed = new URL(url);
  if (parsed.hostname === "x.com" || parsed.hostname.endsWith(".x.com")) {
    parsed.searchParams.set("lang", defaultXLang);
  }
  return parsed.toString();
}

function startChromeForCdp(args) {
  const port = Number(args.port || 9222);
  const exe = detectChromeExe();
  const profile = resolveChromeProfile(args.account, args.profile);
  const commandArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${chromeUserDataDir}`,
    `--profile-directory=${profile}`,
    "--lang=en-US",
    withXLang("https://x.com/home"),
  ];
  const child = spawn(exe, commandArgs, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { port, profile, exe };
}

async function openChromeTarget(url, args = {}) {
  const exe = detectChromeExe();
  const profile = resolveChromeProfile(args.account, args.profile);
  const port = Number(args.port || 9222);
  const reusable = await openUrlInReusableTab(withXLang(url), { port, matchHosts: ["x.com"] }).catch(() => null);
  if (reusable?.ok) return { exe, profile, reused: reusable.reused };
  const commandArgs = [`--profile-directory=${profile}`, "--lang=en-US"];
  commandArgs.push(withXLang(url));
  const child = spawn(exe, commandArgs, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { exe, profile };
}

function runPowerShellFile(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args], {
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
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr || stdout || `PowerShell exited with code ${code}`));
    });
  });
}

async function captureWorkflowScreenshot(prefix) {
  if (process.platform !== "win32") return "";
  ensureDir(workflowScreenshotRoot);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(workflowScreenshotRoot, `${prefix}-${stamp}.png`);
  const scriptPath = path.join(__dirname, "capture-screen.ps1");
  await runPowerShellFile(scriptPath, [filePath]);
  return filePath;
}

async function waitForCdp(port, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(port)) {
      try {
        const version = await httpJson(`http://127.0.0.1:${port}/json/version`);
        if (version.webSocketDebuggerUrl) return version;
      } catch {
        // keep waiting
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Chrome CDP on port ${port}`);
}

async function connectCdp(args) {
  const port = Number(args.port || 9222);
  if (!(await isPortOpen(port))) {
    if (!args.bootstrap) {
      throw new Error(
        `Chrome CDP is not listening on port ${port}. Re-run with --bootstrap to launch Chrome with remote debugging.`,
      );
    }
    if ((await isChromeRunning()) && !args["force-bootstrap"]) {
      throw new Error(
        "Chrome is already running without remote debugging. Close Chrome first, or start one Chrome session with --remote-debugging-port before retrying. Use --force-bootstrap only if you explicitly want another Chrome launch.",
      );
    }
    startChromeForCdp(args);
  }
  await waitForCdp(port);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  if (!context) throw new Error("No Chrome context available over CDP");
  return { browser, context, port };
}

async function pickContextAndPage(args) {
  const { browser, context } = await connectCdp(args);
  const page =
    context.pages().find((candidate) => candidate.url().includes("x.com")) ||
    (await context.newPage());
  return {
    browser,
    context,
    page,
    close: async () => {
      await browser.close();
    },
  };
}

async function ensureX(page) {
  const current = page.url();
  if (!current || !current.includes("x.com")) {
    await page.goto(withXLang("https://x.com/home"), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);
  }
}

async function maybeSwitchAccount(page, account) {
  if (!account) return;
  const handle = resolveHandle(account);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (bodyText.includes(handle)) return;
  const accountButton = page
    .getByRole("button", { name: /Account menu|アカウントメニュー/i })
    .first();
  if (!(await accountButton.isVisible().catch(() => false))) return;
  await accountButton.click({ timeout: 10000 });
  await page.waitForTimeout(1000);
  const switchButton = page
    .getByRole("button", { name: new RegExp(handle.replace("@", "@"), "i") })
    .first();
  if (await switchButton.isVisible().catch(() => false)) {
    await switchButton.click({ timeout: 10000 });
    await page.waitForTimeout(2500);
  }
}

async function waitForEditor(page) {
  const deadline = Date.now() + 30000;
  let lastError = "Article editor did not become ready";
  while (Date.now() < deadline) {
    try {
      const visibleEditors = page
        .locator(
          [
            '[contenteditable="true"]',
            'textarea',
            '[role="textbox"]',
            'input[type="text"]',
          ].join(", "),
        )
        .filter({ hasNot: page.locator("nav") });
      const count = await visibleEditors.count();
      if (count >= 2) return visibleEditors;
      lastError = `Article editor fields not ready yet (${count} found)`;
    } catch (error) {
      lastError = error.message;
    }
    await page.waitForTimeout(750);
  }
  throw new Error(lastError);
}

async function typeMultiline(page, locator, text) {
  await locator.click({ timeout: 10000 });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
  await page.keyboard.press("Backspace").catch(() => {});
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]) await page.keyboard.insertText(lines[i]);
    if (i < lines.length - 1) await page.keyboard.press("Shift+Enter");
  }
}

async function openArticlesComposer(page) {
  await page.goto(withXLang("https://x.com/compose/articles"), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);

  const writeLabels = [/^Write$/i, /^Create$/i, /書く/, /作成/, /記事を書く/];
  for (const label of writeLabels) {
    const button = page.getByRole("button", { name: label }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 10000 });
      await page.waitForTimeout(2000);
      return;
    }
  }

  const links = [
    page.getByRole("link", { name: /Articles/i }).first(),
    page.locator('a[href*="/i/articles"]').first(),
  ];
  for (const link of links) {
    if (await link.isVisible().catch(() => false)) {
      await link.click({ timeout: 10000 });
      await page.waitForTimeout(2000);
      for (const label of writeLabels) {
        const button = page.getByRole("button", { name: label }).first();
        if (await button.isVisible().catch(() => false)) {
          await button.click({ timeout: 10000 });
          await page.waitForTimeout(2000);
          return;
        }
      }
    }
  }

  throw new Error("Could not find the X Articles Write button");
}

async function fillArticle(page, title, body) {
  await openArticlesComposer(page);
  const editors = await waitForEditor(page);
  const titleField = editors.nth(0);
  const bodyField = editors.nth(1);
  await typeMultiline(page, titleField, title || "");
  await page.waitForTimeout(300);
  await typeMultiline(page, bodyField, body || "");
  await page.waitForTimeout(800);
}

async function clickPublish(page) {
  const labels = [/^Publish$/i, /公開/, /Publish article/i];
  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).last();
    if (
      (await button.isVisible().catch(() => false)) &&
      (await button.isEnabled().catch(() => false))
    ) {
      await button.click({ timeout: 10000 });
      return;
    }
  }
  throw new Error("Could not find an enabled X Article publish button");
}

async function articleFlow(args) {
  const account = args.account ? accountName(args.account) : "";
  const title = readTextArg(args, "title", "title-file");
  const body = readTextArg(args, "body", "body-file");
  if (!title.trim() && !body.trim()) {
    throw new Error("Provide --title/--title-file and/or --body/--body-file");
  }
  const draftCopy = saveDraftCopy(account || "existing", title, body);
  console.log(`DRAFT_COPY:${relativeToRoot(draftCopy)}`);

  let session;
  try {
    session = await pickContextAndPage(args);
    await ensureX(session.page);
    if (account) await maybeSwitchAccount(session.page, account);
    await fillArticle(session.page, title, body);
    console.log(`Prepared article. Draft copy: ${draftCopy}`);
    if (args["dry-run"]) {
      const screenshotPath = await captureWorkflowScreenshot("x-article");
      if (screenshotPath) console.log(`SCREENSHOT:${relativeToRoot(screenshotPath)}`);
      console.log("Dry run enabled. Leaving the article prepared without publishing.");
      return;
    }
    await clickPublish(session.page);
    await session.page.waitForTimeout(4000);
    console.log("Published article.");
    const screenshotPath = await captureWorkflowScreenshot("x-article");
    if (screenshotPath) console.log(`SCREENSHOT:${relativeToRoot(screenshotPath)}`);
  } catch (error) {
    if (args["dry-run"]) {
      const { profile } = await openChromeTarget("https://x.com/compose/articles", args);
      console.log(`CDP path failed: ${error.message}`);
      console.log(`Opened X Articles in Chrome profile "${profile}" for manual drafting.`);
      console.log(`Draft copy: ${draftCopy}`);
      const screenshotPath = await captureWorkflowScreenshot("x-article");
      if (screenshotPath) console.log(`SCREENSHOT:${relativeToRoot(screenshotPath)}`);
      return;
    }
    throw error;
  } finally {
    if (session) {
      await session.close();
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === "help") {
    console.log("Usage:");
    console.log(
      "  node scripts/x-article.js publish --existing --account main --title-file tmp/title.txt --body-file tmp/body.md --dry-run",
    );
    console.log(
      "  node scripts/x-article.js publish --existing --bootstrap --account main --title \"...\" --body \"...\"",
    );
    process.exit(0);
  }
  if (command === "publish") {
    await articleFlow(args);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
