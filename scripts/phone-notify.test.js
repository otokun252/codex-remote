const test = require("node:test");
const assert = require("node:assert/strict");

const { notificationTargets, notifyBridgeUrls, notifyPhoneEvent } = require("./phone-notify");

test("notificationTargets stays empty without opt-in environment variables", () => {
  assert.deepEqual(notificationTargets({}), []);
});

test("notifyBridgeUrls posts to configured ntfy topic", async () => {
  const requests = [];
  const results = await notifyBridgeUrls(["https://remote.example.com/?token=secret"], {
    env: { PHONE_NTFY_TOPIC: "codex-phone", PHONE_NTFY_SERVER: "https://ntfy.example", PHONE_NTFY_TOKEN: "tok" },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200 };
    },
  });

  assert.deepEqual(results, [{ type: "ntfy", ok: true }]);
  assert.equal(requests[0].url, "https://ntfy.example/codex-phone");
  assert.equal(requests[0].options.method, "POST");
  assert.ok(requests[0].options.signal);
  assert.equal(requests[0].options.headers.authorization, "Bearer tok");
  assert.match(requests[0].options.body, /Codex phone bridge is ready/);
});

test("notifyBridgeUrls rejects non-https ntfy servers", async () => {
  const results = await notifyBridgeUrls(["https://remote.example.com/?token=secret"], {
    env: { PHONE_NTFY_TOPIC: "codex-phone", PHONE_NTFY_SERVER: "http://ntfy.example" },
    fetch: async () => {
      throw new Error("fetch should not be called");
    },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].type, "ntfy");
  assert.equal(results[0].ok, false);
  assert.match(results[0].error, /must use https/);
});

test("notifyBridgeUrls posts to configured Pushover account", async () => {
  const requests = [];
  const results = await notifyBridgeUrls(["https://remote.example.com/?token=secret"], {
    env: { PHONE_PUSHOVER_TOKEN: "app", PHONE_PUSHOVER_USER: "user", PHONE_PUSHOVER_DEVICE: "iphone" },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200 };
    },
  });

  assert.deepEqual(results, [{ type: "pushover", ok: true }]);
  assert.equal(requests[0].url, "https://api.pushover.net/1/messages.json");
  assert.equal(requests[0].options.method, "POST");
  assert.ok(requests[0].options.signal);
  assert.equal(requests[0].options.body.get("token"), "app");
  assert.equal(requests[0].options.body.get("user"), "user");
  assert.equal(requests[0].options.body.get("device"), "iphone");
});

test("notifyBridgeUrls omits provider link fields without a public URL", async () => {
  const requests = [];
  const results = await notifyBridgeUrls([], {
    env: {
      PHONE_NTFY_TOPIC: "codex-phone",
      PHONE_NTFY_SERVER: "https://ntfy.example",
      PHONE_PUSHOVER_TOKEN: "app",
      PHONE_PUSHOVER_USER: "user",
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200 };
    },
  });

  assert.deepEqual(results, [
    { type: "ntfy", ok: true },
    { type: "pushover", ok: true },
  ]);
  assert.equal(requests[0].options.headers.click, undefined);
  assert.match(requests[0].options.body, /No public access URL is ready/);
  assert.equal(requests[1].options.body.has("url"), false);
  assert.equal(requests[1].options.body.has("url_title"), false);
  assert.match(requests[1].options.body.get("message"), /No public access URL is ready/);
});

test("notifyBridgeUrls posts to configured Discord webhook", async () => {
  const requests = [];
  const results = await notifyBridgeUrls(["https://remote.example.com/?token=secret"], {
    env: { PHONE_DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/123/abc" },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 204 };
    },
  });

  assert.deepEqual(results, [{ type: "discord", ok: true }]);
  assert.equal(requests[0].url, "https://discord.com/api/webhooks/123/abc");
  assert.equal(requests[0].options.method, "POST");
  assert.ok(requests[0].options.signal);
  assert.equal(requests[0].options.headers["content-type"], "application/json");
  assert.match(JSON.parse(requests[0].options.body).content, /Codex phone bridge is ready/);
  assert.deepEqual(JSON.parse(requests[0].options.body).allowed_mentions, { parse: [] });
});

test("notifyBridgeUrls rejects non-Discord webhook URLs", async () => {
  const results = await notifyBridgeUrls(["https://remote.example.com/?token=secret"], {
    env: { PHONE_DISCORD_WEBHOOK_URL: "https://example.com/webhook" },
    fetch: async () => {
      throw new Error("fetch should not be called");
    },
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].type, "discord");
  assert.equal(results[0].ok, false);
  assert.match(results[0].error, /Discord https webhook URL/);
});

test("notifyBridgeUrls reports provider HTTP failures without stopping startup", async () => {
  const results = await notifyBridgeUrls(["https://remote.example.com/?token=secret"], {
    env: { PHONE_PUSHOVER_TOKEN: "app", PHONE_PUSHOVER_USER: "user" },
    fetch: async () => ({ ok: false, status: 401 }),
  });

  assert.deepEqual(results, [{ type: "pushover", ok: false, error: "Pushover returned HTTP 401" }]);
});

test("notifyPhoneEvent sends custom completion text", async () => {
  const requests = [];
  const results = await notifyPhoneEvent({
    urls: ["https://remote.example.com/?token=secret"],
    title: "Codex の処理が完了しました。",
    body: "thread: abc123",
    footer: "スマホで結果を確認できます。",
    pushTitle: "Codex Remote 完了",
    pushUrlTitle: "Codex Remote を開く",
    env: { PHONE_PUSHOVER_TOKEN: "app", PHONE_PUSHOVER_USER: "user" },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200 };
    },
  });

  assert.deepEqual(results, [{ type: "pushover", ok: true }]);
  assert.equal(requests[0].options.body.get("title"), "Codex Remote 完了");
  assert.match(requests[0].options.body.get("message"), /Codex の処理が完了しました。/);
  assert.match(requests[0].options.body.get("message"), /thread: abc123/);
  assert.equal(requests[0].options.body.get("url_title"), "Codex Remote を開く");
});
