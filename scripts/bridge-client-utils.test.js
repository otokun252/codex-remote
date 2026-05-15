const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ensureDeviceId,
  readConnectionProfile,
  writeConnectionProfile,
  resolveInitialConnection,
  saveDraft,
  readDraft,
  clearDraft,
  computeReconnectDelay,
  shouldAutoReconnect,
} = require("../public/bridge-client-utils.js");

class MemoryStorage {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed));
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

test("deviceId is generated once and then reused", () => {
  const storage = new MemoryStorage();
  const cryptoLike = { randomUUID: () => "device-123" };
  assert.equal(ensureDeviceId(storage, cryptoLike), "device-123");
  assert.equal(ensureDeviceId(storage, { randomUUID: () => "device-456" }), "device-123");
});

test("token from URL is saved into the connection profile", () => {
  const storage = new MemoryStorage();
  const result = resolveInitialConnection("?token=abc123&thread=thread-1", storage, { randomUUID: () => "device-1" });
  assert.equal(result.token, "abc123");
  assert.equal(result.lastThread, "thread-1");
  const profile = readConnectionProfile(storage);
  assert.equal(profile.token, "abc123");
  assert.equal(profile.lastThread, "thread-1");
});

test("stored token is reused when URL has no token", () => {
  const storage = new MemoryStorage({
    codexPhoneConnectionProfile: JSON.stringify({
      token: "saved-token",
      deviceId: "device-9",
      lastThread: "thread-9",
    }),
  });
  const result = resolveInitialConnection("", storage, { randomUUID: () => "device-new" });
  assert.equal(result.token, "saved-token");
  assert.equal(result.deviceId, "device-9");
  assert.equal(result.lastThread, "thread-9");
});

test("reconnect backoff never exceeds the max", () => {
  const delays = Array.from({ length: 10 }, (_, index) =>
    computeReconnectDelay(index, { baseMs: 1500, maxMs: 30000, jitterRatio: 0, random: () => 0 }),
  );
  assert.equal(delays.at(-1), 30000);
  assert.ok(delays.every((value) => value <= 30000));
});

test("intentional close disables auto reconnect", () => {
  assert.equal(shouldAutoReconnect({ token: "x", intentionalClose: true, manualClose: false, online: true }), false);
  assert.equal(shouldAutoReconnect({ token: "x", intentionalClose: false, manualClose: false, online: true }), true);
  assert.equal(shouldAutoReconnect({ token: "x", intentionalClose: false, manualClose: true, online: true }), false);
});

test("draft is saved, restored, and cleared", () => {
  const storage = new MemoryStorage();
  saveDraft(storage, { text: "draft text", threadId: "thread-a" });
  assert.deepEqual(readDraft(storage), { text: "draft text", threadId: "thread-a" });
  clearDraft(storage);
  assert.equal(readDraft(storage), null);
});

test("profile write updates reasoning, speed, and theme", () => {
  const storage = new MemoryStorage();
  writeConnectionProfile(storage, {
    token: "abc",
    deviceId: "device-2",
    reasoning: "高",
    speed: "高速",
    theme: "cyberpunk",
  });
  const profile = readConnectionProfile(storage);
  assert.equal(profile.reasoning, "高");
  assert.equal(profile.speed, "高速");
  assert.equal(profile.theme, "cyberpunk");
});
