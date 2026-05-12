const test = require("node:test");
const assert = require("node:assert/strict");

const { findTryCloudflareUrl } = require("./cloudflared-tunnel");

test("findTryCloudflareUrl extracts the Quick Tunnel URL from cloudflared logs", () => {
  assert.equal(
    findTryCloudflareUrl("INF +--------------------------------------------------------------------------------------------+\nhttps://quiet-river-123.trycloudflare.com"),
    "https://quiet-river-123.trycloudflare.com",
  );
});

test("findTryCloudflareUrl returns null when no public URL is present", () => {
  assert.equal(findTryCloudflareUrl("Starting tunnel"), null);
});
