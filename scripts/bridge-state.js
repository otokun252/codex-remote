function bridgeKeyForRequest(threadId, connectionId) {
  if (threadId) return threadId;
  return "new:shared";
}

function shouldDisposeIdleBridge({ clientCount, keepAlive = true }) {
  return !keepAlive && clientCount === 0;
}

function shouldPromoteBridgeKey({ bridgeKey, threadId }) {
  return Boolean(threadId && bridgeKey && bridgeKey !== threadId && bridgeKey.startsWith("new:"));
}

module.exports = {
  bridgeKeyForRequest,
  shouldDisposeIdleBridge,
  shouldPromoteBridgeKey,
};
