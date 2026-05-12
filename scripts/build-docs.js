const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const buildRoot = path.join(os.tmpdir(), "codexremote-docs-build");
const sourceDocs = path.join(root, "docs");
const tempDocs = path.join(buildRoot, "docs");
const tempNodeModules = path.join(buildRoot, "node_modules");
const sourceNodeModules = path.join(root, "node_modules");
const targetDist = path.join(sourceDocs, ".vitepress", "dist");
const tempDist = path.join(tempDocs, ".vitepress", "dist");

function step(message) {
  console.log(`[docs] ${message}`);
}

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function removeOutput(target) {
  if (process.platform !== "win32") {
    rm(target);
    return;
  }
  if (!fs.existsSync(target)) return;
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Remove-Item -LiteralPath ${psQuote(target)} -Recurse -Force`,
  ], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

function copyOutput(from, to) {
  if (process.platform !== "win32") {
    copyDir(from, to);
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Copy-Item -LiteralPath ${psQuote(from)} -Destination ${psQuote(to)} -Recurse -Force`,
  ], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

function copySourceDocs(from, to) {
  fs.cpSync(from, to, {
    recursive: true,
    filter(source) {
      const normalized = source.replace(/\\/g, "/");
      return !normalized.includes("/docs/.vitepress/dist") && !normalized.includes("/docs/.vitepress/cache");
    },
  });
}

step(`preparing ${buildRoot}`);
rm(buildRoot);
fs.mkdirSync(buildRoot, { recursive: true });
step("copying docs");
copySourceDocs(sourceDocs, tempDocs);
fs.copyFileSync(path.join(root, "package.json"), path.join(buildRoot, "package.json"));

if (!fs.existsSync(sourceNodeModules)) {
  throw new Error("node_modules was not found. Run npm install first.");
}

if (process.platform === "win32") {
  step("linking node_modules");
  const link = spawnSync("cmd.exe", ["/c", "mklink", "/J", tempNodeModules, sourceNodeModules], {
    cwd: buildRoot,
    stdio: "inherit",
  });
  if (link.status !== 0) process.exit(link.status || 1);
} else {
  step("linking node_modules");
  fs.symlinkSync(sourceNodeModules, tempNodeModules, "dir");
}

const vitepressBin = path.join(tempNodeModules, "vitepress", "bin", "vitepress.js");
step("running vitepress");
const result = spawnSync(process.execPath, [vitepressBin, "build", "docs"], {
  cwd: buildRoot,
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

step("copying dist");
removeOutput(targetDist);
copyOutput(tempDist, targetDist);
console.log(`Docs built: ${targetDist}`);
