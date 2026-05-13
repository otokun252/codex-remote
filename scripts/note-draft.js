const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { openUrlInReusableTab } = require("./chrome-tab-reuse");

const root = path.resolve(__dirname, "..");
const localAppData =
  process.env.LOCALAPPDATA ||
  process.env.APPDATA ||
  path.join(os.homedir(), "AppData", "Local");
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
const noteDraftRoot = path.join(root, "tmp", "note-drafts");
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
  return JSON.parse(fs.readFileSync(accountConfigPath, "utf8"));
}

function resolveChromeProfile(account, overrideProfile) {
  const config = loadAccountConfig();
  const meta = config[account] || {};
  return overrideProfile || meta.chromeProfile || "Default";
}

function readTextArg(args, key, fileKey) {
  if (typeof args[key] === "string") return args[key];
  if (typeof args[fileKey] === "string") {
    return fs.readFileSync(path.resolve(args[fileKey]), "utf8");
  }
  return "";
}

function saveDraftCopy(title, body) {
  ensureDir(noteDraftRoot);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(noteDraftRoot, `${stamp}.md`);
  const content = title.trim() ? `# ${title.trim()}\n\n${body}` : body;
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function relativeToRoot(target) {
  return path.relative(root, target).replace(/\\/g, "/");
}

async function openChromeTarget(url, args = {}) {
  const exe = detectChromeExe();
  const profile = resolveChromeProfile(args.account, args.profile);
  const port = Number(args.port || 9222);
  const reusable = await openUrlInReusableTab(url, { port, matchHosts: ["note.com"] }).catch(() => null);
  if (reusable?.ok) return { exe, profile, reused: reusable.reused };
  const commandArgs = [`--profile-directory=${profile}`];
  if (args["new-window"]) {
    commandArgs.push("--new-window");
  }
  commandArgs.push(url);
  const child = spawn(exe, commandArgs, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { exe, profile };
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

async function saveFlow(args) {
  const title = readTextArg(args, "title", "title-file");
  const body = readTextArg(args, "body", "body-file");
  if (!title.trim() && !body.trim()) {
    throw new Error("Provide --title/--title-file and/or --body/--body-file");
  }
  const draftCopy = saveDraftCopy(title, body);
  const delayMs = Number(args["send-delay-ms"] || 7000);
  const { profile } = await openChromeTarget("https://note.com/new", args);
  const scriptPath = path.join(__dirname, "note-draft-uia.py");
  const helperArgs = [
    scriptPath,
    "--timeout-ms",
    String(Math.max(delayMs + 20000, 45000)),
    "--title",
    title,
    "--body",
    body,
  ];
  if (args["dry-run"]) helperArgs.push("--dry-run");
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const result = await runPythonScript(helperArgs[0], helperArgs.slice(1));
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  console.log(`Saved note draft using Chrome profile "${profile}". Copy: ${draftCopy}`);
  console.log(`DRAFT_COPY:${relativeToRoot(draftCopy)}`);
  const screenshotPath = await captureWorkflowScreenshot("note-draft");
  if (screenshotPath) console.log(`SCREENSHOT:${relativeToRoot(screenshotPath)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === "help") {
    console.log("Usage:");
    console.log('  node scripts/note-draft.js save --account main --title "..." --body "..."');
    console.log('  node scripts/note-draft.js save --account main --title-file tmp/title.txt --body-file tmp/body.md');
    process.exit(0);
  }
  if (command === "save") {
    await saveFlow(args);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
