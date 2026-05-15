const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const http = require("http");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const localAppData =
  process.env.LOCALAPPDATA ||
  process.env.APPDATA ||
  path.join(os.homedir(), "AppData", "Local");
const profileRoot =
  process.env.X_PROFILE_ROOT ||
  path.join(localAppData, "codexremote", "x-profiles");
const postRoot = path.join(root, "tmp", "x-posts");
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

function profileDir(account) {
  return path.join(profileRoot, account);
}

function readTextInput(args) {
  if (typeof args.text === "string") return args.text;
  if (typeof args["text-file"] === "string") {
    return fs.readFileSync(path.resolve(args["text-file"]), "utf8");
  }
  throw new Error("Provide --text or --text-file");
}

function saveDraftCopy(account, text) {
  ensureDir(postRoot);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(postRoot, `${stamp}-${account}.txt`);
  fs.writeFileSync(file, text, "utf8");
  return file;
}

function relativeToRoot(target) {
  return path.relative(root, target).replace(/\\/g, "/");
}

function detectChromeExe() {
  if (fs.existsSync(defaultChromeExe)) return defaultChromeExe;
  if (fs.existsSync(defaultChromeExeX86)) return defaultChromeExeX86;
  throw new Error(
    "Chrome executable not found. Set CHROME_EXE if installed in a custom path.",
  );
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

function composeUrl(text) {
  return `https://x.com/compose/post?lang=${defaultXLang}&text=${encodeURIComponent(text)}`;
}

function withXLang(url) {
  const parsed = new URL(url);
  if (parsed.hostname === "x.com" || parsed.hostname.endsWith(".x.com")) {
    parsed.searchParams.set("lang", defaultXLang);
  }
  return parsed.toString();
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

async function waitForCdp(port, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(port)) {
      try {
        const version = await httpJson(
          `http://127.0.0.1:${port}/json/version`,
        );
        if (version.webSocketDebuggerUrl) return version;
      } catch {
        // keep waiting
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Chrome CDP on port ${port}`);
}

async function launchPersistentAccountContext(account, headless = false) {
  ensureDir(profileDir(account));
  return chromium.launchPersistentContext(profileDir(account), {
    headless,
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
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

function openChromeTarget(url, args = {}) {
  const exe = detectChromeExe();
  const profile = resolveChromeProfile(args.account, args.profile);
  const commandArgs = [
    `--profile-directory=${profile}`,
    "--lang=en-US",
  ];
  if (args["new-window"]) {
    commandArgs.push("--new-window");
  }
  commandArgs.push(withXLang(url));
  const child = spawn(exe, commandArgs, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { exe, profile };
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
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

function runPythonScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [scriptPath, ...args], {
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
      reject(new Error(stderr || stdout || `Python exited with code ${code}`));
    });
  });
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

async function waitForLogin(page) {
  const timeoutMs = 5 * 60 * 1000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const url = page.url();
    if (/x\.com\/home/.test(url) || /x\.com\/[^/]+$/.test(url)) return;
    await page.waitForTimeout(1000);
  }
  throw new Error("Timed out waiting for X login to complete");
}

async function loginFlow(account) {
  const context = await launchPersistentAccountContext(account, false);
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(withXLang("https://x.com/i/flow/login"), {
      waitUntil: "domcontentloaded",
    });
    console.log(`Login window opened for account "${account}".`);
    console.log(
      "Complete login in the browser window. Waiting for X home/profile...",
    );
    await waitForLogin(page);
    console.log(`Login saved for account "${account}".`);
  } finally {
    await context.close();
  }
}

async function pickContextAndPage(args) {
  if (args.existing || args.bootstrap) {
    const { browser, context, port } = await connectCdp(args);
    const page =
      context.pages().find((candidate) => candidate.url().includes("x.com")) ||
      (await context.newPage());
    return {
      kind: "cdp",
      browser,
      context,
      page,
      port,
      close: async () => {
        await browser.close();
      },
    };
  }
  const account = accountName(args.account);
  const context = await launchPersistentAccountContext(account, false);
  const page = context.pages()[0] || (await context.newPage());
  return {
    kind: "persistent",
    context,
    page,
    close: async () => {
      await context.close();
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

async function fillComposer(page, text, quoteUrl) {
  if (quoteUrl) {
    await page.goto(withXLang(quoteUrl), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const repostButtons = await page
      .getByRole("button", { name: /repost|リポスト/i })
      .all();
    if (!repostButtons.length) {
      throw new Error("Could not find a repost button on the quote target");
    }
    await repostButtons[0].click({ timeout: 10000 });
    await page.waitForTimeout(1000);
    await page
      .getByRole("menuitem", { name: /Quote|引用/i })
      .click({ timeout: 10000 });
  } else {
    await page.goto(withXLang("https://x.com/compose/post"), {
      waitUntil: "domcontentloaded",
    });
  }
  await page.waitForTimeout(2500);
  const textbox = page
    .getByRole("textbox", { name: /Post text|ポスト本文/i })
    .first();
  await textbox.click({ timeout: 10000 });
  await textbox.fill(text, { timeout: 10000 });
}

async function clickPublish(page) {
  const labels = [/^Post$/i, /ポストする/i, /投稿する/i];
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
  throw new Error("Could not find an enabled X publish button");
}

async function publishWithHotkeyFallback(args, text) {
  if (process.platform !== "win32") {
    throw new Error("Hotkey fallback is supported only on Windows.");
  }
  if (args["quote-url"]) {
    throw new Error(
      "Hotkey fallback does not support quote posts. Use CDP mode for quote posting.",
    );
  }
  const delayMs = Number(args["send-delay-ms"] || 7000);
  const compose = composeUrl(text);
  const { profile } = openChromeTarget(compose, args);
  if (args["dry-run"]) {
    console.log(
      `Opened compose window in Chrome profile "${profile}" without publishing.`,
    );
    return;
  }
  const script = [
    "$wshell = New-Object -ComObject WScript.Shell",
    `Start-Sleep -Milliseconds ${delayMs}`,
    "$null = $wshell.AppActivate('Chrome')",
    "Start-Sleep -Milliseconds 500",
    "$wshell.SendKeys('^{ENTER}')",
  ].join("; ");
  await runPowerShell(script);
  console.log(
    `Opened compose window in Chrome profile "${profile}" and sent Ctrl+Enter.`,
  );
}

async function publishWithUiaFallback(args, text) {
  if (process.platform !== "win32") {
    throw new Error("UIA fallback is supported only on Windows.");
  }
  if (args["quote-url"]) {
    throw new Error(
      "UIA fallback does not support quote posts. Use CDP mode for quote posting.",
    );
  }
  const delayMs = Number(args["send-delay-ms"] || 7000);
  const compose = composeUrl(text);
  const { profile } = openChromeTarget(compose, args);
  const scriptPath = path.join(__dirname, "x-post-uia.py");
  const helperArgs = [
    scriptPath,
    "--timeout-ms",
    String(Math.max(delayMs + 15000, 30000)),
    "--window-title-regex",
    ".*X.*Google Chrome",
    "--text-snippet",
    text.slice(0, 48),
  ];
  if (args["dry-run"]) {
    helperArgs.push("--dry-run");
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const result = await runPythonScript(helperArgs[0], helperArgs.slice(1));
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  console.log(`UIA fallback completed in Chrome profile "${profile}".`);
}

async function publishWithFallbacks(args, text, primaryError) {
  const failures = [];
  if (primaryError) failures.push(`CDP path failed: ${primaryError.message}`);

  if (args["uia-fallback"] && !args["quote-url"]) {
    try {
      console.log(primaryError ? `CDP path failed: ${primaryError.message}` : "Trying Chrome UIA publish.");
      console.log("Falling back to Chrome UIA button click.");
      await publishWithUiaFallback(args, text);
      const screenshotPath = await captureWorkflowScreenshot("x-post");
      if (screenshotPath) console.log(`SCREENSHOT:${relativeToRoot(screenshotPath)}`);
      return;
    } catch (uiaError) {
      failures.push(`UIA fallback failed: ${uiaError.message}`);
    }
  }

  if (args["hotkey-fallback"] && !args["quote-url"]) {
    try {
      if (failures.length) {
        for (const failure of failures) console.log(failure);
      }
      console.log("Falling back to Chrome hotkey publish.");
      await publishWithHotkeyFallback(args, text);
      const screenshotPath = await captureWorkflowScreenshot("x-post");
      if (screenshotPath) console.log(`SCREENSHOT:${relativeToRoot(screenshotPath)}`);
      return;
    } catch (hotkeyError) {
      failures.push(`Hotkey fallback failed: ${hotkeyError.message}`);
    }
  }

  throw new Error(failures.join("\n"));
}

async function postFlow(args) {
  const account = args.account ? accountName(args.account) : "";
  const text = readTextInput(args);
  const quoteUrl =
    typeof args["quote-url"] === "string" ? args["quote-url"] : "";
  const draftCopy = saveDraftCopy(account || "existing", text);
  console.log(`DRAFT_COPY:${relativeToRoot(draftCopy)}`);
  if (args.uia) {
    console.log(`Prepared post. Draft copy: ${draftCopy}`);
    await publishWithUiaFallback(args, text);
    const screenshotPath = await captureWorkflowScreenshot("x-post");
    if (screenshotPath) console.log(`SCREENSHOT:${relativeToRoot(screenshotPath)}`);
    return;
  }
  if (args.hotkey) {
    console.log(`Prepared post. Draft copy: ${draftCopy}`);
    await publishWithHotkeyFallback(args, text);
    const screenshotPath = await captureWorkflowScreenshot("x-post");
    if (screenshotPath) console.log(`SCREENSHOT:${relativeToRoot(screenshotPath)}`);
    return;
  }

  let session;
  try {
    session = await pickContextAndPage(args);
    await ensureX(session.page);
    if (account) await maybeSwitchAccount(session.page, account);
    await fillComposer(session.page, text, quoteUrl);
    console.log(`Prepared post. Draft copy: ${draftCopy}`);
    if (args["dry-run"]) {
      console.log("Dry run enabled. Leaving the post prepared without publishing.");
      return;
    }
    await clickPublish(session.page);
    await session.page.waitForTimeout(4000);
    console.log("Published post.");
    const screenshotPath = await captureWorkflowScreenshot("x-post");
    if (screenshotPath) console.log(`SCREENSHOT:${relativeToRoot(screenshotPath)}`);
  } catch (error) {
    if ((args["uia-fallback"] || args["hotkey-fallback"]) && !quoteUrl) {
      await publishWithFallbacks(args, text, error);
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
    console.log("  node scripts/x-publisher.js login --account main");
    console.log(
      "  node scripts/x-publisher.js post --account main --text-file tmp/post.txt --dry-run",
    );
    console.log(
      "  node scripts/x-publisher.js post --existing --bootstrap --profile Default --account main --text \"...\"",
    );
    console.log(
      "  node scripts/x-publisher.js post --existing --quote-url https://x.com/... --text \"...\"",
    );
    console.log(
      "  node scripts/x-publisher.js post --hotkey --account main --text \"...\"",
    );
    console.log(
      "  node scripts/x-publisher.js post --uia --account main --text \"...\"",
    );
    console.log(
      "  node scripts/x-publisher.js post --existing --bootstrap --uia-fallback --account main --text \"...\"",
    );
    console.log(
      "  node scripts/x-publisher.js post --existing --bootstrap --hotkey-fallback --account main --text \"...\"",
    );
    process.exit(0);
  }
  if (command === "login") {
    await loginFlow(accountName(args.account));
    return;
  }
  if (command === "post") {
    await postFlow(args);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
