const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const logDir = path.join(root, "tmp", "supervisor");
const logPath = path.join(logDir, "bridge-supervisor.log");

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

function writeLog(message) {
  fs.mkdirSync(logDir, { recursive: true });
  const line = `${new Date().toISOString()} ${message}`;
  fs.appendFileSync(logPath, `${line}\n`);
  console.log(line);
}

function requestOk(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", () => resolve(false));
  });
}

loadEnvFile(path.join(root, ".env"));

process.env.PHONE_PRODUCT_MODE = process.env.PHONE_PRODUCT_MODE || "1";
process.env.PHONE_PUBLIC_TUNNEL = process.env.PHONE_PUBLIC_TUNNEL || "0";

const port = Number(process.env.PHONE_UI_PORT || 45214);
const healthUrl = `http://127.0.0.1:${port}/api/info`;
const healthIntervalMs = Number(process.env.PHONE_SUPERVISOR_HEALTH_MS || 15000);
const restartDelayMs = Number(process.env.PHONE_SUPERVISOR_RESTART_MS || 3000);
const maxFailures = Number(process.env.PHONE_SUPERVISOR_MAX_FAILURES || 3);

let child = null;
let stopping = false;
let restartTimer = null;
let healthTimer = null;
let failureCount = 0;

function startBridge() {
  if (stopping || child) return;
  writeLog("starting product bridge");
  child = spawn(process.execPath, [path.join(root, "scripts", "start-product.js")], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => writeLog(`[bridge:out] ${chunk.toString().trimEnd()}`));
  child.stderr.on("data", (chunk) => writeLog(`[bridge:err] ${chunk.toString().trimEnd()}`));
  child.on("error", (error) => writeLog(`bridge start error: ${error.message}`));
  child.on("exit", (code, signal) => {
    writeLog(`bridge exited code=${code} signal=${signal}`);
    child = null;
    failureCount = 0;
    if (!stopping) scheduleRestart();
  });
}

function scheduleRestart() {
  if (restartTimer || stopping) return;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startBridge();
  }, restartDelayMs);
}

function stopBridge() {
  if (!child) return;
  const current = child;
  child = null;
  current.kill("SIGINT");
  setTimeout(() => {
    if (current.exitCode === null && !current.killed) current.kill("SIGKILL");
  }, 5000).unref();
}

async function healthCheck() {
  if (stopping || !child) return;
  const ok = await requestOk(healthUrl);
  if (ok) {
    failureCount = 0;
    return;
  }
  failureCount += 1;
  writeLog(`health check failed ${failureCount}/${maxFailures}: ${healthUrl}`);
  if (failureCount >= maxFailures) {
    writeLog("restarting bridge after repeated health failures");
    failureCount = 0;
    stopBridge();
    scheduleRestart();
  }
}

function shutdown() {
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  if (healthTimer) clearInterval(healthTimer);
  stopBridge();
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

writeLog(`supervisor ready; health=${healthUrl}`);
startBridge();
healthTimer = setInterval(healthCheck, healthIntervalMs);
