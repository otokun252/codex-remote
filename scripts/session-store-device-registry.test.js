const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { SessionStore } = require("./session-store");

function tempStatePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "codex-remote-state-")), "state.json");
}

test("device registry tracks connect and disconnect state", () => {
  const store = new SessionStore(tempStatePath());
  const device = store.recordDeviceConnection("device-a", {
    deviceName: "iPhone",
    userAgent: "iphone",
    lastSessionId: "thread-1",
  });
  assert.equal(device.deviceName, "iPhone");
  assert.equal(device.connected, true);
  assert.equal(device.connectionCount, 1);

  const disconnected = store.recordDeviceDisconnect("device-a");
  assert.equal(disconnected.connected, false);
  assert.ok(disconnected.lastDisconnectedAt);
});

test("currentForDevice returns the latest session and global artifacts", () => {
  const store = new SessionStore(tempStatePath());
  store.recordDeviceConnection("device-b", { lastSessionId: "thread-2", lastThreadId: "thread-2" });
  store.upsertSession("thread-2", { threadId: "thread-2", status: "running", history: [{ type: "user", text: "hello" }] });
  store.addArtifact("thread-2", { type: "image", path: "docs/assets/cat.png", url: "/api/file/raw?path=docs/assets/cat.png" });
  const current = store.currentForDevice("device-b");
  assert.equal(current.device.id, "device-b");
  assert.equal(current.session.threadId, "thread-2");
  assert.equal(current.artifacts.length, 1);
});

test("listDevices returns devices ordered by latest activity", () => {
  const store = new SessionStore(tempStatePath());
  store.recordDeviceConnection("device-1", { deviceName: "Android" });
  store.recordDeviceConnection("device-2", { deviceName: "iPad" });
  const devices = store.listDevices();
  assert.equal(devices.length, 2);
  assert.equal(devices[0].deviceName, "iPad");
});
