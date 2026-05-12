const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const defaultState = {
  version: 1,
  devices: {},
  sessions: {},
  artifacts: [],
};

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class SessionStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = clone(defaultState);
    this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      this.save();
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      this.state = {
        ...clone(defaultState),
        ...parsed,
        devices: parsed.devices || {},
        sessions: parsed.sessions || {},
        artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
      };
    } catch {
      this.state = clone(defaultState);
      this.save();
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(tempPath, this.filePath);
  }

  ensureDevice(deviceId = "") {
    const id = String(deviceId || "").trim() || crypto.randomUUID();
    const existing = this.state.devices[id] || {};
    const next = {
      id,
      createdAt: existing.createdAt || now(),
      updatedAt: now(),
      lastSeenAt: now(),
      lastSessionId: existing.lastSessionId || "",
      agentId: existing.agentId || "local-codex",
    };
    this.state.devices[id] = next;
    this.save();
    return clone(next);
  }

  touchDevice(deviceId, patch = {}) {
    const device = this.ensureDevice(deviceId);
    const next = {
      ...device,
      ...patch,
      updatedAt: now(),
      lastSeenAt: now(),
    };
    this.state.devices[device.id] = next;
    this.save();
    return clone(next);
  }

  upsertSession(sessionId, patch = {}) {
    const id = String(sessionId || "").trim();
    if (!id) return null;
    const existing = this.state.sessions[id] || {};
    const next = {
      id,
      createdAt: existing.createdAt || now(),
      updatedAt: now(),
      status: existing.status || "starting",
      history: existing.history || [],
      artifacts: existing.artifacts || [],
      ...patch,
    };
    this.state.sessions[id] = next;
    this.save();
    return clone(next);
  }

  updateSession(sessionId, patch = {}) {
    const existing = this.state.sessions[sessionId] || { id: sessionId, createdAt: now(), history: [], artifacts: [] };
    return this.upsertSession(sessionId, {
      ...existing,
      ...patch,
      updatedAt: now(),
    });
  }

  appendHistory(sessionId, entry, limit = 120) {
    const existing = this.state.sessions[sessionId] || { id: sessionId, createdAt: now(), status: "starting", history: [], artifacts: [] };
    const history = [...(existing.history || []), { ...entry, at: entry.at || now() }].slice(-limit);
    return this.updateSession(sessionId, { history });
  }

  addArtifact(sessionId, artifact) {
    const normalized = {
      id: artifact.id || crypto.randomUUID(),
      sessionId: sessionId || "",
      type: artifact.type || "file",
      path: artifact.path,
      name: artifact.name || path.basename(artifact.path || ""),
      url: artifact.url || "",
      createdAt: artifact.createdAt || now(),
    };
    if (!normalized.path) return null;
    this.state.artifacts = [normalized, ...this.state.artifacts.filter((item) => item.path !== normalized.path)].slice(0, 200);
    if (sessionId) {
      const existing = this.state.sessions[sessionId] || { id: sessionId, createdAt: now(), status: "starting", history: [], artifacts: [] };
      const artifacts = [normalized, ...(existing.artifacts || []).filter((item) => item.path !== normalized.path)].slice(0, 80);
      this.state.sessions[sessionId] = { ...existing, artifacts, updatedAt: now() };
    }
    this.save();
    return clone(normalized);
  }

  getSession(sessionId) {
    return clone(this.state.sessions[sessionId] || null);
  }

  currentForDevice(deviceId) {
    const device = deviceId ? this.state.devices[deviceId] : null;
    const session = device?.lastSessionId ? this.state.sessions[device.lastSessionId] || null : null;
    return {
      device: device ? clone(device) : null,
      session: session ? clone(session) : null,
      artifacts: clone(this.state.artifacts.slice(0, 40)),
    };
  }
}

module.exports = { SessionStore };
