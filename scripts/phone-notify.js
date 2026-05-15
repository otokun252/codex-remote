function envValue(env, key) {
  const value = env[key];
  return value && String(value).trim();
}

function ntfyConfig(env) {
  const topic = envValue(env, "PHONE_NTFY_TOPIC");
  if (!topic) return null;
  const server = envValue(env, "PHONE_NTFY_SERVER") || "https://ntfy.sh";
  return {
    type: "ntfy",
    server: server.replace(/\/+$/, ""),
    topic,
    token: envValue(env, "PHONE_NTFY_TOKEN"),
  };
}

function pushoverConfig(env) {
  const token = envValue(env, "PHONE_PUSHOVER_TOKEN");
  const user = envValue(env, "PHONE_PUSHOVER_USER");
  if (!token || !user) return null;
  return {
    type: "pushover",
    token,
    user,
    device: envValue(env, "PHONE_PUSHOVER_DEVICE"),
  };
}

function discordConfig(env) {
  const webhookUrl = envValue(env, "PHONE_DISCORD_WEBHOOK_URL");
  if (!webhookUrl) return null;
  return {
    type: "discord",
    webhookUrl,
  };
}

function notificationTargets(env = process.env) {
  return [ntfyConfig(env), pushoverConfig(env), discordConfig(env)].filter(Boolean);
}

function notificationTimeoutMs(env = process.env) {
  const value = Number(envValue(env, "PHONE_NOTIFY_TIMEOUT_MS") || 5000);
  return Number.isFinite(value) && value > 0 ? value : 5000;
}

function notificationMessage(urls, options = {}) {
  const title = options.title || "Codex phone bridge is ready.";
  const footer = options.footer || "Open this URL from your phone.";
  const visibleUrls = urls.length ? urls : ["No public access URL is ready yet. Check the bridge console on the host."];
  return [
    title,
    "",
    options.body || "",
    options.body ? "" : "",
    ...visibleUrls,
    "",
    footer,
  ].filter((line, index, rows) => !(line === "" && rows[index - 1] === "")).join("\n");
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function ntfyEndpoint(target) {
  const server = new URL(`${target.server}/`);
  if (server.protocol !== "https:") throw new Error("PHONE_NTFY_SERVER must use https");
  return new URL(encodeURIComponent(target.topic), server).toString();
}

async function postNtfy(target, urls, fetchImpl, timeoutMs) {
  return postNtfyMessage(target, urls, {}, fetchImpl, timeoutMs);
}

async function postNtfyMessage(target, urls, options, fetchImpl, timeoutMs) {
  const headers = {
    title: options.pushTitle || "Codex phone bridge ready",
    tags: "computer,phone",
  };
  if (urls[0]) headers.click = urls[0];
  if (target.token) headers.authorization = `Bearer ${target.token}`;
  const response = await fetchWithTimeout(fetchImpl, ntfyEndpoint(target), {
    method: "POST",
    headers,
    body: notificationMessage(urls, options),
  }, timeoutMs);
  if (!response.ok) throw new Error(`ntfy returned HTTP ${response.status}`);
}

async function postPushover(target, urls, fetchImpl, timeoutMs) {
  return postPushoverMessage(target, urls, {}, fetchImpl, timeoutMs);
}

async function postPushoverMessage(target, urls, options, fetchImpl, timeoutMs) {
  const form = new URLSearchParams({
    token: target.token,
    user: target.user,
    title: options.pushTitle || "Codex phone bridge ready",
    message: notificationMessage(urls, options),
  });
  if (urls[0]) {
    form.set("url", urls[0]);
    form.set("url_title", options.pushUrlTitle || "Open Codex phone bridge");
  }
  if (target.device) form.set("device", target.device);
  const response = await fetchWithTimeout(fetchImpl, "https://api.pushover.net/1/messages.json", {
    method: "POST",
    body: form,
  }, timeoutMs);
  if (!response.ok) throw new Error(`Pushover returned HTTP ${response.status}`);
}

function discordEndpoint(target) {
  const url = new URL(target.webhookUrl);
  const allowedHosts = new Set(["discord.com", "discordapp.com"]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname) || !url.pathname.startsWith("/api/webhooks/")) {
    throw new Error("PHONE_DISCORD_WEBHOOK_URL must be a Discord https webhook URL");
  }
  return url.toString();
}

async function postDiscord(target, urls, fetchImpl, timeoutMs) {
  return postDiscordMessage(target, urls, {}, fetchImpl, timeoutMs);
}

async function postDiscordMessage(target, urls, options, fetchImpl, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, discordEndpoint(target), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: notificationMessage(urls, options),
      allowed_mentions: { parse: [] },
    }),
  }, timeoutMs);
  if (!response.ok) throw new Error(`Discord returned HTTP ${response.status}`);
}

async function notifyBridgeUrls(urls, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || fetch;
  const targets = notificationTargets(env);
  const timeoutMs = notificationTimeoutMs(env);
  const results = [];

  for (const target of targets) {
    try {
      if (target.type === "ntfy") await postNtfy(target, urls, fetchImpl, timeoutMs);
      if (target.type === "pushover") await postPushover(target, urls, fetchImpl, timeoutMs);
      if (target.type === "discord") await postDiscord(target, urls, fetchImpl, timeoutMs);
      results.push({ type: target.type, ok: true });
    } catch (error) {
      results.push({ type: target.type, ok: false, error: error.message });
    }
  }

  return results;
}

async function notifyPhoneEvent(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || fetch;
  const targets = notificationTargets(env);
  const timeoutMs = notificationTimeoutMs(env);
  const urls = Array.isArray(options.urls) ? options.urls.filter(Boolean) : [];
  const results = [];

  for (const target of targets) {
    try {
      if (target.type === "ntfy") await postNtfyMessage(target, urls, options, fetchImpl, timeoutMs);
      if (target.type === "pushover") await postPushoverMessage(target, urls, options, fetchImpl, timeoutMs);
      if (target.type === "discord") await postDiscordMessage(target, urls, options, fetchImpl, timeoutMs);
      results.push({ type: target.type, ok: true });
    } catch (error) {
      results.push({ type: target.type, ok: false, error: error.message });
    }
  }

  return results;
}

module.exports = {
  notificationMessage,
  notificationTargets,
  notificationTimeoutMs,
  notifyBridgeUrls,
  notifyPhoneEvent,
};
