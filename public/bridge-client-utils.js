(function attachBridgeClientUtils(globalScope) {
  const PROFILE_KEY = "codexPhoneConnectionProfile";
  const DRAFT_KEY = "codexPhoneDraft";

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function fallbackDeviceId(now = Date.now(), random = Math.random()) {
    return `device-${now}-${Math.floor(random * 0xffffff).toString(16)}`;
  }

  function inferDeviceName(userAgent = "") {
    const ua = String(userAgent || "").toLowerCase();
    if (ua.includes("ipad")) return "iPad";
    if (ua.includes("iphone")) return "iPhone";
    if (ua.includes("android")) return ua.includes("mobile") ? "Android" : "Android Tablet";
    if (ua.includes("macintosh") || ua.includes("windows") || ua.includes("linux")) return "PC Browser";
    return "Browser";
  }

  function ensureDeviceId(storage, cryptoLike) {
    const current = storage.getItem("codexPhoneDeviceId");
    if (current) return current;
    const next =
      typeof cryptoLike?.randomUUID === "function" ? cryptoLike.randomUUID() : fallbackDeviceId(Date.now(), Math.random());
    storage.setItem("codexPhoneDeviceId", next);
    return next;
  }

  function readConnectionProfile(storage) {
    const profile = safeJsonParse(storage.getItem(PROFILE_KEY), {}) || {};
    const token = profile.token || storage.getItem("codexPhoneToken") || "";
    const deviceId = profile.deviceId || ensureDeviceId(storage, globalScope.crypto);
    const lastThread = profile.lastThread || storage.getItem("codexPhoneLastThread") || "";
    const theme = profile.theme || storage.getItem("codexPhoneTheme") || "simple";
    const preferredModel = profile.preferredModel || storage.getItem("codexPhoneModel") || "";
    const preferredModelLabel = profile.preferredModelLabel || storage.getItem("codexPhoneModelLabel") || "5.5";
    const reasoning = profile.reasoning || storage.getItem("codexPhoneReasoning") || "中";
    const speed = profile.speed || storage.getItem("codexPhoneSpeed") || "通常";
    return {
      token,
      deviceId,
      deviceName: profile.deviceName || inferDeviceName(globalScope.navigator?.userAgent || ""),
      lastPublicUrl: profile.lastPublicUrl || globalScope.location?.origin || "",
      lastThread,
      lastConnectedAt: profile.lastConnectedAt || "",
      preferredModel,
      preferredModelLabel,
      reasoning,
      speed,
      accessMode: profile.accessMode || "フルアクセス",
      theme,
    };
  }

  function writeConnectionProfile(storage, patch) {
    const current = readConnectionProfile(storage);
    const next = { ...current, ...patch };
    storage.setItem(PROFILE_KEY, JSON.stringify(next));
    if (next.token) storage.setItem("codexPhoneToken", next.token);
    if (next.deviceId) storage.setItem("codexPhoneDeviceId", next.deviceId);
    if (next.lastThread) storage.setItem("codexPhoneLastThread", next.lastThread);
    else storage.removeItem("codexPhoneLastThread");
    if (next.theme) storage.setItem("codexPhoneTheme", next.theme);
    if (next.preferredModel) storage.setItem("codexPhoneModel", next.preferredModel);
    if (next.preferredModelLabel) storage.setItem("codexPhoneModelLabel", next.preferredModelLabel);
    if (next.reasoning) storage.setItem("codexPhoneReasoning", next.reasoning);
    if (next.speed) storage.setItem("codexPhoneSpeed", next.speed);
    return next;
  }

  function resolveInitialConnection(search, storage, cryptoLike) {
    const params = new URLSearchParams(search || "");
    const stored = readConnectionProfile(storage);
    const token = params.get("token") || stored.token || "";
    const deviceId = stored.deviceId || ensureDeviceId(storage, cryptoLike);
    const lastThread = params.get("thread") || stored.lastThread || "";
    const deviceName = stored.deviceName || inferDeviceName(globalScope.navigator?.userAgent || "");
    return {
      token,
      deviceId,
      deviceName,
      lastThread,
      profile: writeConnectionProfile(storage, {
        token,
        deviceId,
        deviceName,
        lastThread,
        lastPublicUrl: globalScope.location?.origin || stored.lastPublicUrl || "",
      }),
    };
  }

  function stripTokenFromLocation(nextThread) {
    if (!globalScope.history?.replaceState || !globalScope.location) return;
    const next = new URL(globalScope.location.href);
    next.searchParams.delete("token");
    if (nextThread) next.searchParams.set("thread", nextThread);
    else next.searchParams.delete("thread");
    globalScope.history.replaceState({}, "", next);
  }

  function saveDraft(storage, payload) {
    storage.setItem(DRAFT_KEY, JSON.stringify(payload));
  }

  function readDraft(storage) {
    return safeJsonParse(storage.getItem(DRAFT_KEY), null);
  }

  function clearDraft(storage) {
    storage.removeItem(DRAFT_KEY);
  }

  function computeReconnectDelay(attempt, options = {}) {
    const baseMs = options.baseMs || 1500;
    const maxMs = options.maxMs || 30000;
    const jitterRatio = options.jitterRatio ?? 0.18;
    const random = options.random || Math.random;
    const boundedAttempt = Math.max(0, Number(attempt || 0));
    const rawDelay = Math.min(maxMs, baseMs * 2 ** Math.min(boundedAttempt, 6));
    const jitterWindow = Math.max(0, Math.floor(rawDelay * jitterRatio));
    const jitter = jitterWindow ? Math.floor(random() * jitterWindow) : 0;
    return Math.min(maxMs, rawDelay + jitter);
  }

  function shouldAutoReconnect(options = {}) {
    return Boolean(
      options.token &&
        !options.intentionalClose &&
        !options.manualClose &&
        options.online !== false,
    );
  }

  function shortDeviceId(value = "") {
    const clean = String(value || "").trim();
    if (!clean) return "";
    return clean.length <= 12 ? clean : `${clean.slice(0, 6)}...${clean.slice(-4)}`;
  }

  function resetSavedConnection(storage) {
    storage.removeItem(PROFILE_KEY);
    storage.removeItem("codexPhoneToken");
    storage.removeItem("codexPhoneLastThread");
    storage.removeItem(DRAFT_KEY);
  }

  const api = {
    PROFILE_KEY,
    DRAFT_KEY,
    ensureDeviceId,
    inferDeviceName,
    readConnectionProfile,
    writeConnectionProfile,
    resolveInitialConnection,
    stripTokenFromLocation,
    saveDraft,
    readDraft,
    clearDraft,
    computeReconnectDelay,
    shouldAutoReconnect,
    shortDeviceId,
    resetSavedConnection,
  };

  globalScope.CodexRemoteClientUtils = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
