const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { localCloudflaredPath } = require("./cloudflared-tunnel");

const root = path.resolve(__dirname, "..");
const binDir = path.join(root, ".local-bin");
const target = localCloudflaredPath();

const assetMatchers = {
  "win32-x64": /windows-amd64\.exe$/i,
  "win32-arm64": /windows-arm64\.exe$/i,
  "darwin-x64": /darwin-amd64\.tgz$/i,
  "darwin-arm64": /darwin-arm64\.tgz$/i,
  "linux-x64": /linux-amd64$/i,
  "linux-arm64": /linux-arm64$/i,
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function download(url, filePath) {
  const response = await fetch(url, {
    headers: { "user-agent": "codex-remote" },
  });
  if (!response.ok) fail(`cloudflared download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer, { mode: 0o755 });
}

function extractTgz(archivePath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const result = spawnSync("tar", ["-xzf", archivePath, "-C", outDir], { stdio: "inherit" });
  if (result.status !== 0) fail("cloudflared archive extraction failed.");
  const extracted = path.join(outDir, "cloudflared");
  if (!fs.existsSync(extracted)) fail("cloudflared binary was not found in the archive.");
  fs.copyFileSync(extracted, target);
  fs.chmodSync(target, 0o755);
}

async function main() {
  if (fs.existsSync(target)) {
    console.log(`cloudflared is already installed: ${target}`);
    return;
  }

  const key = `${process.platform}-${process.arch}`;
  const matcher = assetMatchers[key];
  if (!matcher) fail(`Unsupported platform for automatic cloudflared setup: ${key}`);

  console.log("Downloading cloudflared for Quick Tunnel...");
  const release = await fetch("https://api.github.com/repos/cloudflare/cloudflared/releases/latest", {
    headers: { "user-agent": "codex-remote" },
  });
  if (!release.ok) fail(`Could not read cloudflared release metadata: HTTP ${release.status}`);
  const data = await release.json();
  const asset = (data.assets || []).find((item) => matcher.test(item.name || ""));
  if (!asset) fail(`Could not find a cloudflared release asset for ${key}.`);

  fs.mkdirSync(binDir, { recursive: true });
  const tmpPath = path.join(binDir, asset.name);
  await download(asset.browser_download_url, tmpPath);

  if (/\.tgz$/i.test(asset.name)) {
    extractTgz(tmpPath, path.join(binDir, "cloudflared-extract"));
    fs.rmSync(path.join(binDir, "cloudflared-extract"), { recursive: true, force: true });
    fs.rmSync(tmpPath, { force: true });
  } else {
    fs.renameSync(tmpPath, target);
    fs.chmodSync(target, 0o755);
  }

  console.log(`cloudflared installed: ${target}`);
}

main().catch((error) => fail(error.stack || error.message));
