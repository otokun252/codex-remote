const http = require("http");
const net = require("net");
const WebSocket = require("ws");

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect(port, host);
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function httpJson(url, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`${method} ${url} failed: ${res.statusCode} ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function hostForUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function tabMatchesHosts(tab, hosts = []) {
  const currentHost = hostForUrl(tab?.url || "");
  if (!currentHost) return false;
  return hosts.some((host) => currentHost === host || currentHost.endsWith(`.${host}`));
}

function sendCdpCommand(webSocketDebuggerUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl);
    const id = 1;
    ws.once("open", () => {
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.on("message", (data) => {
      const message = JSON.parse(String(data));
      if (message.id !== id) return;
      ws.close();
      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
        return;
      }
      resolve(message.result || {});
    });
    ws.once("error", reject);
  });
}

async function openDevtoolsUrl(port, path, method = "GET") {
  return httpJson(`http://127.0.0.1:${port}${path}`, method);
}

async function createTab(port, url) {
  const encoded = encodeURIComponent(url);
  try {
    return await openDevtoolsUrl(port, `/json/new?${encoded}`, "PUT");
  } catch {
    return openDevtoolsUrl(port, `/json/new?${encoded}`, "GET");
  }
}

async function activateTab(port, id) {
  if (!id) return;
  try {
    await openDevtoolsUrl(port, `/json/activate/${encodeURIComponent(id)}`);
  } catch {
    // Activating is best-effort; navigation still succeeds without it.
  }
}

async function openUrlInReusableTab(url, { port = 9222, matchHosts = [] } = {}) {
  if (!(await isPortOpen(port))) return { ok: false, reason: "cdp-not-open" };
  const targetHost = hostForUrl(url);
  const hosts = matchHosts.length ? matchHosts.map((host) => host.toLowerCase()) : [targetHost].filter(Boolean);
  const tabs = await openDevtoolsUrl(port, "/json/list");
  let tab = (tabs || []).find((candidate) => candidate.type === "page" && tabMatchesHosts(candidate, hosts));
  let reused = true;
  if (!tab) {
    tab = await createTab(port, url);
    reused = false;
  } else if (tab.webSocketDebuggerUrl) {
    await sendCdpCommand(tab.webSocketDebuggerUrl, "Page.navigate", { url });
  }
  await activateTab(port, tab.id);
  return { ok: true, reused, tabId: tab.id || "", url };
}

module.exports = {
  hostForUrl,
  openUrlInReusableTab,
  tabMatchesHosts,
};
