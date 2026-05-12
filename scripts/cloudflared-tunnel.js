const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");

function localCloudflaredPath() {
  const exe = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
  return path.join(root, ".local-bin", exe);
}

function cloudflaredCommand(env = process.env) {
  if (env.CLOUDFLARED_BIN) return env.CLOUDFLARED_BIN;
  const local = localCloudflaredPath();
  if (fs.existsSync(local)) return local;
  return "cloudflared";
}

function findTryCloudflareUrl(text) {
  const match = String(text).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return match ? match[0] : null;
}

function startQuickTunnel({ localUrl, env = process.env, onUrl = () => {} }) {
  const child = spawn(cloudflaredCommand(env), ["tunnel", "--url", localUrl, "--no-autoupdate"], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let announced = false;
  const handleOutput = (chunk, stream) => {
    const text = chunk.toString();
    const publicUrl = findTryCloudflareUrl(text);
    if (publicUrl && !announced) {
      announced = true;
      onUrl(publicUrl);
    }
    stream.write(`[tunnel] ${text}`);
  };

  child.stdout.on("data", (chunk) => handleOutput(chunk, process.stdout));
  child.stderr.on("data", (chunk) => handleOutput(chunk, process.stderr));
  child.on("error", (error) => {
    console.error(`[tunnel] failed to start cloudflared: ${error.message}`);
  });
  child.on("exit", (code, signal) => {
    console.error(`[tunnel] exited code=${code} signal=${signal}`);
  });

  return child;
}

module.exports = {
  findTryCloudflareUrl,
  localCloudflaredPath,
  startQuickTunnel,
};
