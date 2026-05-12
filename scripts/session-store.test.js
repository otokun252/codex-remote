const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const { SessionStore } = require("./session-store");

test("session store falls back when atomic rename is blocked", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-remote-session-store-"));
  const filePath = path.join(dir, "state.json");
  const originalRenameSync = fs.renameSync;
  let renameCalls = 0;
  fs.renameSync = () => {
    renameCalls += 1;
    const error = new Error("simulated OneDrive lock");
    error.code = "EPERM";
    throw error;
  };
  try {
    const store = new SessionStore(filePath);
    const device = store.ensureDevice("phone-1");
    assert.equal(device.id, "phone-1");
    assert.ok(renameCalls > 0);
    const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
    assert.ok(saved.devices["phone-1"]);
  } finally {
    fs.renameSync = originalRenameSync;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
