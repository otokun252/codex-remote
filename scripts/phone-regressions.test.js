const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function installBrowserStubs() {
  const elements = new Map();
  class FakeClassList {
    constructor() {
      this.values = new Set();
    }
    add(...names) {
      for (const name of names) this.values.add(name);
    }
    remove(...names) {
      for (const name of names) this.values.delete(name);
    }
    contains(name) {
      return this.values.has(name);
    }
    toggle(name, force) {
      const next = force === undefined ? !this.values.has(name) : Boolean(force);
      if (next) this.values.add(name);
      else this.values.delete(name);
      return next;
    }
  }
  class FakeElement {
    constructor(selector = "") {
      this.selector = selector;
      this.children = [];
      this.dataset = {};
      this.classList = new FakeClassList();
      this.style = {};
      this.value = "";
      this.textContent = "";
      this.innerHTML = "";
      this.disabled = false;
    }
    addEventListener() {}
    append(...children) {
      this.children.push(...children);
    }
    appendChild(child) {
      this.children.push(child);
      return child;
    }
    prepend(...children) {
      this.children.unshift(...children);
    }
    insertBefore(child) {
      this.children.push(child);
      return child;
    }
    replaceChildren(...children) {
      this.children = children;
    }
    querySelector(selector) {
      return new FakeElement(selector);
    }
    querySelectorAll() {
      return [];
    }
    setAttribute(name, value) {
      this[name] = value;
    }
    contains() {
      return false;
    }
    closest() {
      return null;
    }
    focus() {}
    remove() {}
  }

  global.document = {
    body: new FakeElement("body"),
    documentElement: new FakeElement("html"),
    visibilityState: "visible",
    addEventListener() {},
    createElement: (tag) => new FakeElement(tag),
    querySelector: (selector) => {
      if (!elements.has(selector)) elements.set(selector, new FakeElement(selector));
      return elements.get(selector);
    },
    querySelectorAll: () => [],
  };
  global.location = { protocol: "http:", host: "127.0.0.1:45214", search: "" };
  global.localStorage = {
    values: new Map(),
    getItem(key) {
      return this.values.get(key) || "";
    },
    setItem(key, value) {
      this.values.set(key, String(value));
    },
  };
  global.navigator = { serviceWorker: { register: () => Promise.resolve() } };
  global.crypto = { randomUUID: () => "device-test" };
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: true, threads: [], artifacts: [], bridges: [] }) });
  global.setInterval = () => 0;
  global.clearInterval = () => {};
  global.setTimeout = (callback) => {
    if (typeof callback === "function") callback();
    return 0;
  };
  global.WebSocket = class FakeWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    static CLOSING = 2;
    constructor() {
      this.readyState = FakeWebSocket.OPEN;
    }
    addEventListener() {}
    send() {}
  };
}

test("queued websocket acknowledgement does not duplicate the optimistic waiting message", () => {
  installBrowserStubs();
  const { shouldShowQueuedStatus } = require("../public/main");

  assert.equal(shouldShowQueuedStatus("please keep going", "please keep going"), false);
  assert.equal(shouldShowQueuedStatus("please keep going", ""), true);
  assert.equal(shouldShowQueuedStatus("a different follow-up", "please keep going"), true);
});

test("recent artifact preview tracking suppresses duplicate screenshot/image displays", () => {
  installBrowserStubs();
  const { rememberRecentArtifactPreview } = require("../public/main");
  const seen = new Map();

  assert.equal(rememberRecentArtifactPreview(seen, "tmp/workflow-screenshots/x.png", { source: "history", now: 1000 }), false);
  assert.equal(rememberRecentArtifactPreview(seen, "tmp/workflow-screenshots/x.png", { source: "ws", now: 1200 }), true);
  assert.equal(rememberRecentArtifactPreview(seen, "tmp/workflow-screenshots/x.png", { source: "ws", now: 7001 }), false);
});

test("session artifacts are updated in place instead of duplicated", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-remote-artifacts-"));
  try {
    const { SessionStore } = require("./session-store");
    const store = new SessionStore(path.join(dir, "state.json"));

    const first = store.addArtifact("thread-1", { type: "screenshot", path: "tmp/workflow-screenshots/x.png", url: "/raw/x.png?v=1" });
    const duplicate = store.addArtifact("thread-1", { type: "screenshot", path: "tmp/workflow-screenshots/x.png", url: "/raw/x.png?v=1" });

    assert.equal(first.unchanged, false);
    assert.equal(duplicate.unchanged, true);
    assert.equal(store.state.artifacts.length, 1);
    assert.equal(store.state.sessions["thread-1"].artifacts.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("interrupt follow-up only restarts the bridge while a turn is active or starting", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-remote-start-phone-"));
  process.env.PHONE_STATE_DIR = dir;
  try {
    const { shouldRestartForInterrupt } = require("./start-phone");

    assert.equal(shouldRestartForInterrupt({ activeTurnId: "turn-1", pendingTurnStart: false }), true);
    assert.equal(shouldRestartForInterrupt({ activeTurnId: "", pendingTurnStart: true }), true);
    assert.equal(shouldRestartForInterrupt({ activeTurnId: "", pendingTurnStart: false }), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("chrome tab reuse matches an existing product tab by host", () => {
  const { hostForUrl, tabMatchesHosts } = require("./chrome-tab-reuse");

  assert.equal(hostForUrl("https://x.com/compose/post?lang=en"), "x.com");
  assert.equal(tabMatchesHosts({ url: "https://x.com/home" }, ["x.com"]), true);
  assert.equal(tabMatchesHosts({ url: "https://editor.note.com/notes/1" }, ["note.com"]), true);
  assert.equal(tabMatchesHosts({ url: "https://example.com/" }, ["x.com", "note.com"]), false);
});
