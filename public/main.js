const log = document.querySelector("#log");
const meta = document.querySelector("#meta");
const connectButton = document.querySelector("#connect");
const newThreadButton = document.querySelector("#newThread");
const searchButton = document.querySelector("#searchButton");
const pluginsButton = document.querySelector("#pluginsButton");
const automationsButton = document.querySelector("#automationsButton");
const settingsButton = document.querySelector("#settingsButton");
const menuButton = document.querySelector("#menuButton");
const previewButton = document.querySelector("#previewButton");
const closePanelButton = document.querySelector("#closePanelButton");
const addButton = document.querySelector("#addButton");
const imageButton = document.querySelector("#imageButton");
const accessButton = document.querySelector("#accessButton");
const stopButton = document.querySelector("#stopButton");
const thinkingButton = document.querySelector("#thinkingButton");
const modelButton = document.querySelector("#modelButton");
const modelMenu = document.querySelector("#modelMenu");
const voiceButton = document.querySelector("#voiceButton");
const fileInput = document.querySelector("#fileInput");
const attachments = document.querySelector("#attachments");
const mobileThreadsButton = document.querySelector("#mobileThreads");
const sidebarScrim = document.querySelector("#sidebarScrim");
const artifactPanel = document.querySelector(".artifact-panel");
const artifactButtons = document.querySelectorAll("[data-artifact]");
const artifactTitle = document.querySelector("#artifactTitle");
const artifactList = document.querySelector("#artifactList");
const artifactPreview = document.querySelector("#artifactPreview");
const terminalList = document.querySelector("#terminalList");
const statusButton = document.querySelector("#statusButton");
const webSearchButton = document.querySelector("#webSearchButton");
const runState = document.querySelector("#runState");
const runStateLabel = document.querySelector("#runStateLabel");
const threadList = document.querySelector("#threadList");
const threadSearch = document.querySelector("#threadSearch");
const threadTitle = document.querySelector("#threadTitle");
const composer = document.querySelector("#composer");
const promptInput = document.querySelector("#prompt");
const sendButton = document.querySelector("#send");
const approval = document.querySelector("#approval");
const approvalText = document.querySelector("#approvalText");
const approveButton = document.querySelector("#approve");
const declineButton = document.querySelector("#decline");
let workflowButton = document.querySelector("#workflowButton");
const defaultSendButtonLabel = sendButton ? sendButton.innerHTML : "";

const params = new URLSearchParams(location.search);
const token = params.get("token") || localStorage.getItem("codexPhoneToken") || "";
const deviceId =
  localStorage.getItem("codexPhoneDeviceId") ||
  (crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`);
localStorage.setItem("codexPhoneDeviceId", deviceId);
let selectedThread = params.get("thread") || localStorage.getItem("codexPhoneLastThread") || "";
if (token) localStorage.setItem("codexPhoneToken", token);
let appInfo = { productMode: false };

const themeOptions = [
  { id: "simple", name: "シンプル", detail: "今のCodex Desktop風" },
  { id: "cyberpunk", name: "サイバーパンク", detail: "暗め / ネオンアクセント" },
  { id: "botanical", name: "ボタニカル", detail: "葉色 / 紙のような柔らかさ" },
];
let selectedTheme = localStorage.getItem("codexPhoneTheme") || "simple";

let ws = null;
let pendingApproval = null;
let assistantEntry = null;
let statusGroup = null;
let threadCache = [];
let liveTurnActive = false;
let lastHistorySignature = "";
let lastThreadListError = "";
let lastThreadRefreshError = "";
let selectedThreadRefreshActive = false;
let selectedModel = localStorage.getItem("codexPhoneModel") || "";
let selectedModelLabel = localStorage.getItem("codexPhoneModelLabel") || "5.5";
let selectedReasoning = localStorage.getItem("codexPhoneReasoning") || "中";
let selectedSpeed = localStorage.getItem("codexPhoneSpeed") || "通常";
let settingsRenderSeq = 0;
let artifactItems = [];
let activeArtifactPath = "";
let activeFolderPath = "";
let currentArtifactResult = null;
let accessMode = {
  label: "フルアクセス",
  approvalPolicy: "never",
  sandboxMode: "danger-full-access",
};
let pendingFiles = [];
let reconnectTimer = null;
let reconnectAttempts = 0;
let intentionalClose = false;
let pendingFollowUpPreview = "";
const recentArtifactPreviews = new Map();

const runStateText = {
  connecting: "接続中",
  ready: "待機中",
  running: "Codex 処理中",
  streaming: "回答生成中",
  approval: "承認待ち",
  syncing: "履歴同期中",
  done: "完了",
  disconnected: "切断",
  error: "エラー",
};

function setRunState(state, label) {
  if (!runState || !runStateLabel) return;
  const nextLabel = label || runStateText[state] || state;
  if (runState.dataset.state === state && runStateLabel.textContent === nextLabel) return;
  runState.dataset.state = state;
  runStateLabel.textContent = nextLabel;
}

function applyTheme(themeId) {
  const nextTheme = themeOptions.some((theme) => theme.id === themeId) ? themeId : "simple";
  selectedTheme = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("codexPhoneTheme", nextTheme);
}

applyTheme(selectedTheme);

function ensureWorkflowButton() {
  if (workflowButton) return workflowButton;
  const nav = document.querySelector(".primary-nav");
  if (!nav) return null;
  workflowButton = document.createElement("button");
  workflowButton.type = "button";
  workflowButton.className = "nav-command muted";
  workflowButton.id = "workflowButton";
  workflowButton.textContent = "投稿";
  nav.insertBefore(workflowButton, pluginsButton || null);
  return workflowButton;
}

const accessModes = [
  { label: "フルアクセス", approvalPolicy: "never", sandboxMode: "danger-full-access" },
  { label: "確認モード", approvalPolicy: "on-request", sandboxMode: "workspace-write" },
  { label: "読み取り専用", approvalPolicy: "on-request", sandboxMode: "read-only" },
];

function updateModelButton() {
  modelButton.textContent = `${selectedModelLabel} / ${selectedReasoning} / ${selectedSpeed}`;
  for (const row of modelMenu.querySelectorAll("[data-reasoning]")) {
    const active = row.dataset.reasoning === selectedReasoning;
    row.classList.toggle("active", active);
    let mark = row.querySelector(".checkmark");
    if (active && !mark) {
      mark = document.createElement("span");
      mark.className = "checkmark";
      mark.textContent = "✓";
      row.appendChild(mark);
    } else if (!active && mark) {
      mark.remove();
    }
  }
  for (const row of modelMenu.querySelectorAll("[data-speed]")) {
    const active = row.dataset.speed === selectedSpeed;
    row.classList.toggle("active", active);
    let mark = row.querySelector(".checkmark");
    if (active && !mark) {
      mark = document.createElement("span");
      mark.className = "checkmark";
      mark.textContent = "✓";
      row.appendChild(mark);
    } else if (!active && mark) {
      mark.remove();
    }
  }
  for (const row of modelMenu.querySelectorAll("[data-model-choice]")) {
    row.classList.toggle("active", row.dataset.modelChoice === selectedModel);
  }
}

function closeModelMenu() {
  modelMenu.classList.add("hidden");
}

function toggleModelMenu() {
  updateModelButton();
  modelMenu.classList.toggle("hidden");
}

function selectReasoning(value) {
  selectedReasoning = value;
  localStorage.setItem("codexPhoneReasoning", value);
  updateModelButton();
  closeModelMenu();
  addStatus(`思考量を ${value} に設定しました。`);
}

function selectSpeed(value) {
  selectedSpeed = value;
  localStorage.setItem("codexPhoneSpeed", value);
  updateModelButton();
  closeModelMenu();
  addStatus(`速度を ${value} に設定しました。`);
}

function normalizeReasoningEffort(value) {
  const clean = String(value || "").trim();
  if (clean === "低") return "low";
  if (clean === "中") return "medium";
  if (clean === "高") return "high";
  if (clean === "非常に高") return "xhigh";
  return "medium";
}

function effectiveReasoningEffort() {
  const levels = ["low", "medium", "high", "xhigh"];
  let index = levels.indexOf(normalizeReasoningEffort(selectedReasoning));
  if (index < 0) index = 1;
  if (selectedSpeed === "高速") index = Math.max(0, index - 1);
  if (selectedSpeed === "丁寧") index = Math.min(levels.length - 1, index + 1);
  return levels[index];
}

function threadQueryParam() {
  return selectedThread ? `?thread=${encodeURIComponent(selectedThread)}` : "";
}

function selectModel(model) {
  selectedModel = model;
  selectedModelLabel = model.replace(/^gpt-/, "").toUpperCase().replace(/^GPT-/, "");
  if (selectedModelLabel.startsWith("5.")) selectedModelLabel = selectedModelLabel;
  localStorage.setItem("codexPhoneModel", selectedModel);
  localStorage.setItem("codexPhoneModelLabel", selectedModelLabel);
  updateModelButton();
  closeModelMenu();
  addStatus(`モデルを ${model.toUpperCase()} に設定しました。次の送信から反映します。`);
}

function titleForThread(thread) {
  const raw = thread.name || thread.preview || thread.cwd || thread.id;
  const firstLine = raw.split("\n").find(Boolean) || thread.id;
  return firstLine.length > 54 ? `${firstLine.slice(0, 54)}...` : firstLine;
}

function projectForThread(thread) {
  const cwd = String(thread.cwd || "").replace(/\/+$/, "");
  if (!cwd) return "No project";
  return cwd.split("/").filter(Boolean).pop() || cwd;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const ms = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  const diffSeconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const hours = Math.floor(diffSeconds / 3600);
  const days = Math.floor(diffSeconds / 86400);
  const months = Math.floor(days / 30);
  if (diffSeconds < 3600) return "今";
  if (hours < 24) return `${hours}時間`;
  if (days < 30) return `${days}日`;
  return `${months || 1}か月`;
}

function isBlockStart(line) {
  return (
    /^```/.test(line) ||
    /^#{1,4}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line)
  );
}

function sanitizeHref(value) {
  try {
    const url = new URL(value, location.href);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return url.href;
  } catch {
    return "";
  }
  return "";
}

function isImageHref(value) {
  return /\.(png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(String(value || ""));
}

function normalizeImageHref(value) {
  if (/^https?:\/\//i.test(value)) return value;
  const clean = String(value || "").replace(/^\.\//, "");
  if (clean.startsWith("/api/file/raw") || clean.startsWith("/api/uploaded")) return urlWithToken(clean);
  const localPath = clean.replace(/[?#].*$/, "");
  if (
    /^[a-z]:[\\/]/i.test(localPath) &&
    /(?:^|[\\/])\.codex[\\/]generated_images[\\/].+\.(?:png|jpe?g|gif|webp|svg)$/i.test(localPath)
  ) {
    return urlWithToken(`/api/codex-generated-image?path=${encodeURIComponent(localPath)}`);
  }
  const repoImage = localPath.match(/(?:^|[/\\])(docs[/\\](?:assets|public)[/\\].+\.(?:png|jpe?g|gif|webp|svg))$/i);
  if (repoImage) {
    const relativeAsset = repoImage[1].replace(/\\/g, "/");
    return urlWithToken(`/api/file/raw?path=${encodeURIComponent(relativeAsset)}`);
  }
  if (/^[^?#]+\/[^?#]+\.(png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(clean)) {
    return urlWithToken(`/api/file/raw?path=${encodeURIComponent(localPath)}`);
  }
  if (/^[^/\\]+$/.test(clean) && isImageHref(clean)) {
    return urlWithToken(`/api/file/raw?path=${encodeURIComponent(`docs/assets/${clean}`)}`);
  }
  return value;
}

function sanitizeMarkdownHtml(html) {
  const allowedTags = new Set([
    "A",
    "B",
    "BR",
    "CODE",
    "DEL",
    "DETAILS",
    "DIV",
    "EM",
    "FIGCAPTION",
    "FIGURE",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "IMG",
    "KBD",
    "P",
    "PRE",
    "S",
    "SPAN",
    "STRONG",
    "SUB",
    "SUMMARY",
    "SUP",
    "TABLE",
    "TBODY",
    "TD",
    "TH",
    "THEAD",
    "TR",
    "UL",
    "OL",
    "LI",
  ]);
  const template = document.createElement("template");
  template.innerHTML = html;

  const sanitizeNode = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE || !allowedTags.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent || ""));
        continue;
      }

      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value;
        if (name.startsWith("on") || name === "style" || name === "class" || name === "id") {
          child.removeAttribute(attribute.name);
          continue;
        }
        if (child.tagName === "A" && name === "href") {
          const safeHref = sanitizeHref(value);
          if (safeHref) {
            child.setAttribute("href", safeHref);
            child.setAttribute("target", "_blank");
            child.setAttribute("rel", "noreferrer");
          } else {
            child.removeAttribute(attribute.name);
          }
          continue;
        }
        if (child.tagName === "IMG" && name === "src") {
          child.setAttribute("src", normalizeImageHref(value));
          child.setAttribute("loading", "lazy");
          continue;
        }
        if (child.tagName === "IMG" && ["alt", "width", "height"].includes(name)) continue;
        if (["align", "colspan", "rowspan"].includes(name)) continue;
        child.removeAttribute(attribute.name);
      }

      sanitizeNode(child);
    }
  };

  sanitizeNode(template.content);
  return template.innerHTML;
}

function isHtmlBlockStart(line) {
  return /^<\/?(p|div|table|thead|tbody|tr|td|th|a|img|br|h[1-6]|details|summary)\b/i.test(line.trim());
}

function renderInlineMarkdown(text) {
  const codeTokens = [];
  const imageTokens = [];
  let source = String(text).replace(/`([^`]+)`/g, (_, code) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(escapeHtml(code));
    return token;
  });

  source = source.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, label, href) => {
    if (!isImageHref(href)) return _;
    const token = `\u0000IMAGE${imageTokens.length}\u0000`;
    imageTokens.push({ name: label || href.split("/").pop(), url: normalizeImageHref(href) });
    return token;
  });

  source = escapeHtml(source)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      if (isImageHref(href)) {
        const token = `\u0000IMAGE${imageTokens.length}\u0000`;
        imageTokens.push({ name: label, url: normalizeImageHref(href) });
        return token;
      }
      const safeHref = sanitizeHref(href);
      if (!safeHref) return label;
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");

  return source
    .replace(/\u0000CODE(\d+)\u0000/g, (_, index) => `<code>${codeTokens[Number(index)] || ""}</code>`)
    .replace(/\u0000IMAGE(\d+)\u0000/g, (_, index) => {
      const image = imageTokens[Number(index)];
      if (!image) return "";
      return `<figure class="image-preview markdown-image"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name || "image")}" loading="lazy"><figcaption>${escapeHtml(image.name || "image")}</figcaption></figure>`;
    });
}

function renderMarkdown(text, options = {}) {
  const headingOffset = options.headingOffset ?? 1;
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (options.allowHtml && isHtmlBlockStart(line)) {
      const html = [line];
      const open = line.trim().match(/^<([a-z0-9]+)\b/i)?.[1]?.toLowerCase();
      index += 1;
      while (
        index < lines.length &&
        lines[index].trim() &&
        open &&
        !new RegExp(`</${open}>`, "i").test(html.join("\n"))
      ) {
        html.push(lines[index]);
        index += 1;
      }
      blocks.push(sanitizeMarkdownHtml(html.join("\n")));
      continue;
    }

    const fence = line.match(/^```\s*([a-z0-9_-]+)?\s*$/i);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1] ? ` data-language="${escapeHtml(fence[1])}"` : "";
      blocks.push(`<pre${language}><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + headingOffset, 6);
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${quote.map(renderInlineMarkdown).join("<br>")}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return blocks.join("");
}

function stripUiDirectives(text) {
  return String(text || "")
    .replace(/(?:^|\n)::[a-z0-9-]+\{[^\n]*\}(?=\n|$)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function setEntryText(body, kind, text) {
  body.markdownSource = kind === "assistant" ? stripUiDirectives(text) : text || "";
  if (kind === "assistant" || kind === "user") body.innerHTML = renderMarkdown(body.markdownSource);
  else body.textContent = body.markdownSource;
}

function urlWithToken(url) {
  const target = new URL(url, location.href);
  target.searchParams.set("token", token);
  return target.pathname + target.search;
}

function renderImageGallery(images = []) {
  if (!images.length) return null;
  const gallery = document.createElement("div");
  gallery.className = "image-gallery";
  for (const image of images) {
    const figure = document.createElement("figure");
    figure.className = "image-preview";
    const img = document.createElement("img");
    img.src = image.dataUrl || urlWithToken(image.url);
    img.alt = image.name || "添付画像";
    img.loading = "lazy";
    const caption = document.createElement("figcaption");
    caption.textContent = image.name || "image";
    figure.append(img, caption);
    gallery.appendChild(figure);
  }
  return gallery;
}

function artifactImageForGallery(artifact) {
  if (!artifact) return null;
  return {
    name: artifact.name || String(artifact.path || artifact.url || "image").split(/[\\/]/).pop(),
    url: artifact.url,
  };
}

function extractAssistantImageRefs(text = "") {
  const matches = new Set();
  const source = String(text || "");
  const inlineImageUrls = new Set();
  source.replace(/!\[[^\]]*\]\(([^)\s]+)\)/g, (_, href) => {
    if (isImageHref(href)) inlineImageUrls.add(normalizeImageHref(href));
    return "";
  });
  const patterns = [
    /(?:docs\/assets|tmp\/generated-images|tmp\/workflow-screenshots|tmp\/screen-captures)\/[^\s"'`<>]+\.(?:png|jpe?g|gif|webp|svg)/gi,
    /[a-z]:(?:[\\/][^\s"'`<>]+)+\.(?:png|jpe?g|gif|webp|svg)/gi,
    /\/api\/(?:file\/raw|uploaded)\?[^\s"'`<>]+/gi,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      matches.add(match[0]);
    }
  }
  const seenUrls = new Set();
  return [...matches]
    .map((value) => ({
      name: value.split(/[\\/]/).pop(),
      url: normalizeImageHref(value),
    }))
    .filter((image) => {
      if (inlineImageUrls.has(image.url) || seenUrls.has(image.url)) return false;
      seenUrls.add(image.url);
      return true;
    });
}

function summarizeStatus(items) {
  if (items.some((item) => item.includes("音声入力"))) return "音声入力";
  const reads = items.filter((item) => /^Read\s+/i.test(item)).length;
  const commands = items.filter((item) => /command|コマンド|\$\s/.test(item)).length;
  const files = items.filter((item) => /file|ファイル/i.test(item)).length;
  const parts = [];
  if (reads) parts.push(`${reads}個のファイルを調査`);
  if (commands) parts.push(`${commands}件のコマンドを実行`);
  if (files && !reads) parts.push(`${files}件のファイル操作`);
  return parts.length ? parts.join("、") : `${items.length}件の作業ログ`;
}

function updateStatusGroup(group) {
  const count = group.items.length;
  group.summaryText.textContent = summarizeStatus(group.items);
  group.count.textContent = `${count}件`;
  group.list.replaceChildren(
    ...group.items.map((item) => {
      const row = document.createElement("li");
      row.textContent = item;
      return row;
    }),
  );
}

function addStatusGroupItem(text) {
  if (!statusGroup || statusGroup.items.length >= 12) {
    const el = document.createElement("article");
    el.className = "entry status status-group";

    const avatar = document.createElement("div");
    avatar.className = "entry-avatar";
    avatar.textContent = "›";

    const details = document.createElement("details");
    details.className = "status-details";

    const summary = document.createElement("summary");
    const summaryText = document.createElement("span");
    summaryText.className = "status-summary-text";
    const count = document.createElement("span");
    count.className = "status-count";
    summary.append(summaryText, count);

    const list = document.createElement("ul");
    list.className = "status-list";
    details.append(summary, list);

    const tools = document.createElement("div");
    tools.className = "entry-tools";

    el.append(avatar, details, tools);
    log.appendChild(el);
    statusGroup = { items: [], summaryText, count, list };
  }
  statusGroup.items.push(text);
  updateStatusGroup(statusGroup);
  log.scrollTop = log.scrollHeight;
}

function addEntry(kind, text, images = []) {
  if (kind === "status") {
    addStatusGroupItem(text);
    return null;
  }
  if (kind === "user" && !String(text || "").trim() && !images.length) return null;
  statusGroup = null;
  const el = document.createElement("article");
  el.className = `entry ${kind}`;

  const avatar = document.createElement("div");
  avatar.className = "entry-avatar";
  avatar.textContent = kind === "user" ? "U" : kind === "assistant" ? "C" : "›";

  const body = document.createElement("div");
  body.className = "entry-body";
  setEntryText(body, kind, text);
  const galleryImages =
    kind === "user"
      ? images
      : kind === "assistant"
        ? [...(images || []), ...extractAssistantImageRefs(text)]
        : [];
  const gallery = renderImageGallery(galleryImages);
  if (gallery) body.appendChild(gallery);

  const tools = document.createElement("div");
  tools.className = "entry-tools";
  tools.textContent = kind === "assistant" ? "□  ↗" : "";

  el.append(avatar, body, tools);
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return body;
}

function addStatus(text) {
  addStatusGroupItem(text);
}

function setReady(ready) {
  sendButton.disabled = !ready;
  promptInput.disabled = !ready;
  if (stopButton) stopButton.disabled = !ready;
  updateComposerActions();
}

function updateStopButton() {
  if (!stopButton) return;
  stopButton.disabled = !ws || ws.readyState !== WebSocket.OPEN || (!liveTurnActive && !pendingApproval);
  updateComposerActions();
}

function ensureComposerActionButtons() {
  // The black send button handles normal follow-up guidance while Codex is running.
}

function previewText(value, limit = 72) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function sendComposerMessage(type = "prompt") {
  const text = promptInput.value.trim();
  if ((!text && !pendingFiles.length) || !ws || ws.readyState !== WebSocket.OPEN) return false;
  const displayText = text || "Check the attached image.";
  ws.send(
    JSON.stringify({
      type,
      token,
      text: displayText,
      attachments: pendingFiles,
      options: {
        model: selectedModel || undefined,
        reasoningEffort: effectiveReasoningEffort(),
        approvalPolicy: accessMode.approvalPolicy,
        sandboxMode: accessMode.sandboxMode,
      },
    }),
  );
  promptInput.value = "";
  pendingFiles = [];
  renderAttachments();
  if (type === "followup") {
    pendingFollowUpPreview = previewText(displayText);
    addStatus(`待機に入れました: ${pendingFollowUpPreview}`);
  }
  liveTurnActive = true;
  updateStopButton();
  return true;
}

function updateComposerActions() {
  ensureComposerActionButtons();
  const connected = Boolean(ws && ws.readyState === WebSocket.OPEN);
  const hasDraft = Boolean(promptInput?.value.trim() || pendingFiles.length);
  if (sendButton) {
    sendButton.disabled = !connected;
    sendButton.title = liveTurnActive ? "待機に入れる" : "送信";
    if (sendButton.innerHTML !== defaultSendButtonLabel) sendButton.innerHTML = defaultSendButtonLabel;
  }
}

function rememberArtifactPreview(path, source = "") {
  const key = String(path || "");
  if (!key) return false;
  const now = Date.now();
  for (const [candidate, seenAt] of recentArtifactPreviews) {
    if (now - seenAt > 5000) recentArtifactPreviews.delete(candidate);
  }
  const duplicate = recentArtifactPreviews.has(key);
  recentArtifactPreviews.set(key, now);
  if (source) recentArtifactPreviews.set(`${source}:${key}`, now);
  return duplicate;
}

function renderHistory(history) {
  log.replaceChildren();
  statusGroup = null;
  for (const entry of history || []) addEntry(entry.type, entry.text, entry.attachments || []);
}

function historySignature(history = []) {
  return JSON.stringify(
    history.map((entry) => ({
      type: entry.type,
      text: entry.text || "",
      attachments: (entry.attachments || []).map((attachment) => attachment.name || attachment.url || ""),
    })),
  );
}

function renderHistoryIfChanged(history = []) {
  const signature = historySignature(history);
  if (signature === lastHistorySignature) return false;
  lastHistorySignature = signature;
  renderHistory(history);
  return true;
}

function renderThreadList() {
  threadList.replaceChildren();
  const query = threadSearch.value.trim().toLowerCase();
  const newProject = document.createElement("button");
  newProject.type = "button";
  newProject.className = selectedThread ? "project-heading new-project" : "project-heading new-project active";
  newProject.innerHTML = '<span class="project-folder"></span><span>New project</span>';
  newProject.addEventListener("click", () => selectThread(""));
  threadList.appendChild(newProject);

  const groups = new Map();
  for (const thread of threadCache) {
    const project = projectForThread(thread);
    const title = titleForThread(thread);
    const matches = !query || project.toLowerCase().includes(query) || title.toLowerCase().includes(query);
    if (!matches) continue;
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push(thread);
  }

  for (const [project, threads] of groups) {
    const group = document.createElement("section");
    group.className = "project-group";

    const heading = document.createElement("div");
    heading.className = "project-heading";
    const projectRunning = threads.some((thread) => thread.runtime?.active);
    if (projectRunning) {
      heading.classList.add("running");
      heading.title = "作業中";
    }
    const folder = document.createElement("span");
    folder.className = "project-folder";
    const name = document.createElement("span");
    name.textContent = project;
    heading.append(folder, name);
    group.appendChild(heading);

    const visibleThreads = threads.slice(0, 6);
    for (const thread of visibleThreads) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = thread.id === selectedThread ? "thread-item active" : "thread-item";
      if (thread.runtime?.active) item.classList.add("running");
      item.title = titleForThread(thread);
      const title = document.createElement("span");
      title.className = "thread-title";
      title.textContent = titleForThread(thread);
      const time = document.createElement("span");
      time.className = "thread-time";
      time.textContent = thread.runtime?.active ? "作業中" : formatRelativeTime(thread.updatedAt || thread.createdAt);
      item.append(title, time);
      item.addEventListener("click", () => selectThread(thread.id));
      group.appendChild(item);
    }

    if (threads.length > visibleThreads.length) {
      const more = document.createElement("div");
      more.className = "project-more";
      more.textContent = "もっと表示する";
      group.appendChild(more);
    } else if (!visibleThreads.length) {
      const empty = document.createElement("div");
      empty.className = "project-empty";
      empty.textContent = "チャットはありません";
      group.appendChild(empty);
    }
    threadList.appendChild(group);
  }
}

function authQuery() {
  return `token=${encodeURIComponent(token)}`;
}

async function apiGet(path) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${path}${separator}${authQuery()}`, { cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    if (/<!doctype html/i.test(text)) {
      throw new Error("古いURLまたは切れたトンネルを開いています。PC側の connection.html から最新のQR/URLを開き直してください。");
    }
    throw new Error(`API response was not JSON: ${contentType || "unknown content type"}`);
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `${response.status} ${response.statusText}`);
  return result;
}

async function apiPost(path, body) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${path}${separator}${authQuery()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("API response was not JSON. Open the latest connection URL from the PC.");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `${response.status} ${response.statusText}`);
  return result;
}

async function registerDevice() {
  if (!token) return null;
  try {
    return await apiPost("/api/device/register", { deviceId });
  } catch (error) {
    addEntry("error", `端末登録に失敗しました: ${error.message}`);
    return null;
  }
}

async function loadAppInfo() {
  try {
    appInfo = await apiGet("/api/info");
  } catch {
    appInfo = { productMode: false };
  }
  document.body.dataset.mode = appInfo.productMode ? "product" : "personal";
  if (appInfo.productMode) {
    workflowButton?.remove();
    workflowButton = null;
  }
  return appInfo;
}

async function restoreSessionState() {
  if (!token) return;
  try {
    const result = await apiGet(`/api/session/current?device=${encodeURIComponent(deviceId)}`);
    if (!selectedThread && result.session?.threadId) {
      selectedThread = result.session.threadId;
      localStorage.setItem("codexPhoneLastThread", selectedThread);
      updateUrlThread();
    }
    if (result.session?.history?.length) renderHistoryIfChanged(result.session.history);
    if (result.session?.status === "running" || result.live?.active) setRunState("running", "PC側で処理中");
    else if (result.session?.status === "error") setRunState("error", "前回エラー");
    else if (result.session) setRunState("ready", "前回セッションを復元");
    if (result.artifacts?.length) {
      artifactItems = result.artifacts.map((item) => ({
        path: item.path,
        name: item.name || item.path.split("/").pop(),
        kind: item.type === "image" || item.type === "screenshot" ? "image" : item.type || "file",
      }));
      renderArtifactIndex(artifactItems);
    }
  } catch (error) {
    addStatus(`前回状態を復元できませんでした: ${error.message}`);
  }
}

async function loadThreads({ background = false } = {}) {
  if (!token) return;
  try {
    const result = await apiGet("/api/threads");
    threadCache = result.data || [];
    renderThreadList();
    lastThreadListError = "";
  } catch (error) {
    const message = error.message || String(error);
    if (message !== lastThreadListError) {
      lastThreadListError = message;
      addEntry("error", `thread一覧を読めませんでした: ${message}`);
    }
    if (!background) throw error;
  }
}

async function refreshSelectedThread() {
  if (!selectedThread || liveTurnActive || selectedThreadRefreshActive) return;
  selectedThreadRefreshActive = true;
  try {
    const result = await apiGet(`/api/thread?thread=${encodeURIComponent(selectedThread)}`);
    if (result.threadId !== selectedThread) return;
    renderHistoryIfChanged(result.history || []);
    lastThreadRefreshError = "";
  } catch (error) {
    const message = error.message || String(error);
    if (message !== lastThreadRefreshError) {
      lastThreadRefreshError = message;
      addEntry("error", `thread更新を読めませんでした: ${message}`);
    }
  } finally {
    selectedThreadRefreshActive = false;
  }
}

async function loadArtifacts() {
  if (!token) return;
  try {
    const result = await apiGet(`/api/artifacts${threadQueryParam()}`);
    renderArtifactIndex(result.data || []);
  } catch (error) {
    addEntry("error", `artifact一覧を読めませんでした: ${error.message}`);
  }
}

function updateUrlThread() {
  if (selectedThread) localStorage.setItem("codexPhoneLastThread", selectedThread);
  const next = new URL(location.href);
  if (!appInfo.productMode) {
    if (selectedThread) next.searchParams.set("thread", selectedThread);
    else next.searchParams.delete("thread");
  } else {
    next.searchParams.delete("thread");
  }
  history.replaceState(null, "", next);
}

function syncReadyThread(threadId) {
  if (!threadId || selectedThread === threadId) return;
  selectedThread = threadId;
  activeFolderPath = "";
  activeArtifactPath = "";
  updateUrlThread();
  const selected = threadCache.find((thread) => thread.id === selectedThread);
  threadTitle.textContent = selected ? titleForThread(selected) : selectedThread;
  renderThreadList();
  loadArtifacts();
}

function selectThread(threadId) {
  selectedThread = threadId;
  activeFolderPath = "";
  activeArtifactPath = "";
  if (selectedThread) localStorage.setItem("codexPhoneLastThread", selectedThread);
  else localStorage.removeItem("codexPhoneLastThread");
  updateUrlThread();
  renderThreadList();
  document.body.classList.remove("show-sidebar");
  loadArtifacts();
  connect();
}

function showRightPanel() {
  document.body.classList.remove("hide-artifacts");
  document.body.classList.add("show-panel");
  document.body.classList.remove("show-sidebar");
}

function isRightPanelOpen() {
  if (window.matchMedia("(min-width: 1101px)").matches) {
    return !document.body.classList.contains("hide-artifacts");
  }
  return document.body.classList.contains("show-panel");
}

function closeRightPanel() {
  document.body.classList.add("hide-artifacts");
  document.body.classList.remove("show-panel");
}

function clearPanel(title) {
  showRightPanel();
  artifactTitle.textContent = title;
  artifactList.classList.remove("artifact-browser-list");
  artifactList.replaceChildren();
  activeArtifactPath = "";
  artifactPreview.classList.add("hidden");
  artifactPreview.textContent = "";
}

function addPanelRow(text, detail, onClick) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "artifact-row";
  row.innerHTML = detail ? `<strong>${escapeHtml(text)}</strong><small>${escapeHtml(detail)}</small>` : escapeHtml(text);
  if (onClick) row.addEventListener("click", onClick);
  artifactList.appendChild(row);
  return row;
}

function initialsFor(value) {
  return String(value || "?")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function addPluginRow(plugin, state) {
  const name = plugin.name || plugin.title || plugin.id || "Plugin";
  const detail = plugin.description || plugin.summary || plugin.id || state || "";
  const row = document.createElement("button");
  row.type = "button";
  row.className = "artifact-row plugin-row";

  const icon = document.createElement("span");
  icon.className = "plugin-icon";
  if (plugin.icon || plugin.iconUrl || plugin.logoUrl) {
    const img = document.createElement("img");
    img.src = plugin.icon || plugin.iconUrl || plugin.logoUrl;
    img.alt = "";
    icon.appendChild(img);
  } else {
    icon.textContent = initialsFor(name);
  }

  const text = document.createElement("span");
  text.className = "plugin-copy";
  const label = document.createElement("strong");
  label.textContent = name;
  const small = document.createElement("small");
  small.textContent = [state, detail].filter(Boolean).join(" · ");
  text.append(label, small);
  row.append(icon, text);
  artifactList.appendChild(row);
  return row;
}

function previewProxyUrl(targetUrl) {
  try {
    const target = new URL(targetUrl);
    if ((target.hostname === "127.0.0.1" || target.hostname === "localhost") && target.protocol === "http:") {
      return `/preview/${target.port || "80"}${target.pathname || "/"}?${authQuery()}${target.search ? `&${target.search.slice(1)}` : ""}`;
    }
  } catch {}
  return `/api/preview?${authQuery()}&url=${encodeURIComponent(targetUrl)}`;
}

function authenticatedResourceUrl(url) {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${authQuery()}`;
}

async function capturePcScreen() {
  clearPanel("PC画面");
  addPanelRow("取得中...", "PCで開いている画面をスクショにしています");
  try {
    const result = await apiPost("/api/screen/capture", {});
    await loadArtifacts();
    showRightPanel();
    artifactTitle.textContent = "PC画面";
    artifactList.classList.add("artifact-browser-list");
    activeArtifactPath = result.path;
    renderArtifactRows();
    artifactPreview.className = "artifact-preview";
    artifactPreview.classList.remove("hidden");
    rememberArtifactPreview(result.path, "api");
    setArtifactPreview(result);
    addStatus("PC画面のスクショをスマホへ送りました。");
  } catch (error) {
    showToolError("PC画面", error);
  }
}

function showPreviewTools(defaultUrl = localStorage.getItem("codexPreviewUrl") || "http://127.0.0.1:3000") {
  clearPanel("プレビュー");
  artifactList.replaceChildren();

  const launcher = document.createElement("section");
  launcher.className = "preview-launcher";

  const input = document.createElement("input");
  input.type = "url";
  input.value = defaultUrl;
  input.placeholder = "http://127.0.0.1:3000";
  input.className = "preview-url-input";

  const controls = document.createElement("div");
  controls.className = "preview-controls";

  const open = document.createElement("button");
  open.type = "button";
  open.textContent = "表示";

  const ask = document.createElement("button");
  ask.type = "button";
  ask.textContent = "Codexに起動依頼";

  const capture = document.createElement("button");
  capture.type = "button";
  capture.textContent = "PC画面";

  const quickPorts = document.createElement("div");
  quickPorts.className = "preview-ports";
  for (const port of [3000, 5173, 4173, 8080]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(port);
    button.addEventListener("click", () => {
      input.value = `http://127.0.0.1:${port}`;
      renderPreviewFrame(input.value);
    });
    quickPorts.appendChild(button);
  }

  controls.append(open, ask, capture);
  launcher.append(input, controls, quickPorts);
  artifactList.appendChild(launcher);

  artifactPreview.className = "artifact-preview preview-frame-wrap";
  artifactPreview.innerHTML = "";

  function renderPreviewFrame(url) {
    localStorage.setItem("codexPreviewUrl", url);
    artifactPreview.classList.remove("hidden");
    artifactPreview.innerHTML = `
      <div class="artifact-preview-header">
        <div class="artifact-preview-title">${escapeHtml(url)}</div>
        <button type="button" class="artifact-preview-close" data-preview-close>閉じる</button>
      </div>
      <iframe class="preview-frame" src="${escapeHtml(previewProxyUrl(url))}" title="Preview"></iframe>
    `;
  }

  open.addEventListener("click", () => renderPreviewFrame(input.value.trim() || defaultUrl));
  ask.addEventListener("click", () => {
    promptInput.value = `${promptInput.value}${promptInput.value ? "\n" : ""}このLP/ゲームをスマホで確認できるように、開発サーバーを起動してプレビューURLを教えて。可能なら http://127.0.0.1:3000 か http://127.0.0.1:5173 で起動して。`;
    promptInput.focus();
    closeRightPanel();
  });
  capture.addEventListener("click", capturePcScreen);
  renderPreviewFrame(defaultUrl);
}

function renderArtifactIndex(items) {
  artifactItems = items;
  activeArtifactPath = "";
  artifactTitle.textContent = "アーティファクト";
  artifactList.classList.add("artifact-browser-list");
  renderArtifactRows();
  hideArtifactPreview();
}

function renderArtifactRows() {
  artifactList.replaceChildren();
  for (const item of artifactItems) {
    const icon = item.kind === "image" ? "画像" : item.kind === "markdown" ? "MD" : "FILE";
    const row = addPanelRow(item.name, `${icon} · ${item.path}`, () => showArtifact(item.path));
    row.classList.toggle("active", item.path === activeArtifactPath);
  }
  if (!artifactItems.length) addPanelRow("アーティファクトは見つかりませんでした");
}

function formatFileSize(size) {
  if (size === null || size === undefined) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

async function showFolder(path = activeFolderPath || "") {
  showRightPanel();
  artifactTitle.textContent = path ? `フォルダ: ${path}` : "フォルダ";
  artifactList.classList.add("artifact-browser-list");
  artifactList.replaceChildren();
  artifactPreview.className = "artifact-preview hidden";
  artifactPreview.textContent = "";
  addPanelRow("読み込み中...", path || "作業フォルダ");
  try {
    const query = new URLSearchParams();
    query.set("path", path || "");
    if (selectedThread) query.set("thread", selectedThread);
    const result = await apiGet(`/api/files?${query.toString()}`);
    activeFolderPath = result.path || "";
    artifactTitle.textContent = activeFolderPath ? `フォルダ: ${activeFolderPath}` : "フォルダ";
    artifactList.replaceChildren();
    if (activeFolderPath) addPanelRow("..", "上のフォルダへ", () => showFolder(result.parent || ""));
    for (const item of result.entries || []) {
      const icon = item.kind === "folder" ? "フォルダ" : item.kind === "image" ? "画像" : item.kind === "text" ? "TEXT" : "FILE";
      const detail = item.kind === "folder" ? item.path : `${icon} · ${formatFileSize(item.size)} · ${item.path}`;
      addPanelRow(item.name, detail, () => {
        if (item.kind === "folder") showFolder(item.path);
        else if (item.kind === "image" || item.kind === "text") showArtifact(item.path);
        else addStatus("このファイルはスマホ表示対象外です。必要ならCodexに内容確認を依頼してください。");
      });
    }
    if (!artifactList.children.length) addPanelRow("空のフォルダです");
  } catch (error) {
    showToolError("フォルダ", error);
  }
}

function hideArtifactPreview() {
  activeArtifactPath = "";
  currentArtifactResult = null;
  renderArtifactRows();
  artifactPreview.className = "artifact-preview hidden";
  artifactPreview.textContent = "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function showToolError(name, error) {
  clearPanel(name);
  addPanelRow("読み込みに失敗しました", error.message);
  addEntry("error", `${name}: ${error.message}`);
  document.body.classList.remove("show-sidebar");
}

async function showPlugins() {
  clearPanel("プラグイン");
  addPanelRow("読み込み中...");
  try {
    const result = await apiGet("/api/plugins");
    const marketplaces = result.marketplaces || result.data || [];
    artifactList.replaceChildren();
    for (const marketplace of marketplaces) {
      const plugins = marketplace.plugins || marketplace.entries || [];
      if (!plugins.length) addPanelRow(marketplace.name || marketplace.id || "marketplace", "プラグインなし");
      for (const plugin of plugins) {
        const summary = plugin.summary || plugin;
        addPluginRow(summary, summary.enabled ? "enabled" : summary.installed ? "installed" : "available");
      }
    }
    if (!artifactList.children.length) addPanelRow("プラグインは見つかりませんでした");
  } catch (error) {
    showToolError("プラグイン", error);
  }
}

async function showAutomations() {
  clearPanel("オートメーション");
  addPanelRow("読み込み中...");
  try {
    const result = await apiGet("/api/automations");
    artifactList.replaceChildren();
    for (const automation of result.data || []) addAutomationCard(automation);
    if (!artifactList.children.length) addPanelRow("登録済みオートメーションはありません");
  } catch (error) {
    showToolError("オートメーション", error);
  }
}

async function runWorkflow(path, payload, successLabel) {
  try {
    const result = await apiPost(path, payload);
    addStatus(successLabel);
    if (result.stdout) addStatus(result.stdout.trim());
    if (result.stderr) addStatus(result.stderr.trim());
  } catch (error) {
    addEntry("error", `${successLabel} に失敗: ${error.message}`);
  }
}

function workflowField(label, input) {
  return formField(label, input);
}

function buildWorkflowCard(titleText, subtitleText) {
  const card = document.createElement("section");
  card.className = "panel-card";
  const title = document.createElement("div");
  title.className = "panel-title";
  const text = document.createElement("span");
  text.textContent = titleText;
  title.appendChild(text);
  card.appendChild(title);
  if (subtitleText) {
    const help = document.createElement("p");
    help.className = "workflow-help";
    help.textContent = subtitleText;
    card.appendChild(help);
  }
  return card;
}

function showWorkflows() {
  clearPanel("投稿");
  artifactList.replaceChildren();

  const xCard = buildWorkflowCard("X投稿", "同じChromeプロフィールを使って、余計な新規ウィンドウを増やさずに下書きか投稿まで進めます。");
  const xForm = document.createElement("form");
  xForm.className = "automation-editor";
  const xAccount = document.createElement("select");
  for (const value of ["main", "alt"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    if (value === "main") option.selected = true;
    xAccount.appendChild(option);
  }
  const xText = document.createElement("textarea");
  xText.rows = 8;
  xText.placeholder = "投稿文";
  const xButtons = document.createElement("div");
  xButtons.className = "automation-editor-actions";
  xButtons.append(document.createElement("div"), document.createElement("div"));
  const xDraft = document.createElement("button");
  xDraft.type = "button";
  xDraft.textContent = "下書きで開く";
  const xSubmit = document.createElement("button");
  xSubmit.type = "submit";
  xSubmit.textContent = "そのまま投稿";
  xButtons.append(xDraft, xSubmit);
  xForm.append(workflowField("アカウント", xAccount), workflowField("本文", xText), xButtons);
  xDraft.addEventListener("click", async () => {
    const text = xText.value.trim();
    if (!text) return;
    xDraft.disabled = true;
    xSubmit.disabled = true;
    await runWorkflow("/api/workflows/x-post", { account: xAccount.value, text, draftOnly: true }, "Xの下書きを開きました");
    xDraft.disabled = false;
    xSubmit.disabled = false;
  });
  xForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = xText.value.trim();
    if (!text) return;
    xDraft.disabled = true;
    xSubmit.disabled = true;
    await runWorkflow("/api/workflows/x-post", { account: xAccount.value, text }, "Xに投稿しました");
    xDraft.disabled = false;
    xSubmit.disabled = false;
  });
  xCard.appendChild(xForm);

  const xArticleCard = buildWorkflowCard("X記事", "X Premium の記事機能を使って、長文記事の下書き作成と公開まで進めます。");
  const xArticleForm = document.createElement("form");
  xArticleForm.className = "automation-editor";
  const xArticleAccount = xAccount.cloneNode(true);
  const xArticleTitle = document.createElement("input");
  xArticleTitle.placeholder = "記事タイトル";
  const xArticleBody = document.createElement("textarea");
  xArticleBody.rows = 14;
  xArticleBody.placeholder = "記事本文";
  const xArticleButtons = document.createElement("div");
  xArticleButtons.className = "automation-editor-actions";
  xArticleButtons.append(document.createElement("div"), document.createElement("div"));
  const xArticleDraft = document.createElement("button");
  xArticleDraft.type = "button";
  xArticleDraft.textContent = "下書きで開く";
  const xArticleSubmit = document.createElement("button");
  xArticleSubmit.type = "submit";
  xArticleSubmit.textContent = "記事を公開";
  xArticleButtons.append(xArticleDraft, xArticleSubmit);
  xArticleForm.append(
    workflowField("アカウント", xArticleAccount),
    workflowField("タイトル", xArticleTitle),
    workflowField("本文", xArticleBody),
    xArticleButtons,
  );
  xArticleDraft.addEventListener("click", async () => {
    const title = xArticleTitle.value.trim();
    const body = xArticleBody.value.trim();
    if (!title && !body) return;
    xArticleDraft.disabled = true;
    xArticleSubmit.disabled = true;
    await runWorkflow("/api/workflows/x-article", { account: xArticleAccount.value, title, body, draftOnly: true }, "X記事の下書きを開きました");
    xArticleDraft.disabled = false;
    xArticleSubmit.disabled = false;
  });
  xArticleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = xArticleTitle.value.trim();
    const body = xArticleBody.value.trim();
    if (!title && !body) return;
    xArticleDraft.disabled = true;
    xArticleSubmit.disabled = true;
    await runWorkflow("/api/workflows/x-article", { account: xArticleAccount.value, title, body }, "X記事を公開しました");
    xArticleDraft.disabled = false;
    xArticleSubmit.disabled = false;
  });
  xArticleCard.appendChild(xArticleForm);

  const noteCard = buildWorkflowCard("note下書き", "選んだChromeプロフィールで note を開き、下書き保存まで進めます。");
  const noteForm = document.createElement("form");
  noteForm.className = "automation-editor";
  const noteAccount = document.createElement("select");
  for (const value of ["main", "alt"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    if (value === "main") option.selected = true;
    noteAccount.appendChild(option);
  }
  const noteTitle = document.createElement("input");
  noteTitle.placeholder = "タイトル";
  const noteBody = document.createElement("textarea");
  noteBody.rows = 12;
  noteBody.placeholder = "本文";
  const noteButtons = document.createElement("div");
  noteButtons.className = "automation-editor-actions";
  noteButtons.append(document.createElement("div"), document.createElement("div"));
  const noteSubmit = document.createElement("button");
  noteSubmit.type = "submit";
  noteSubmit.textContent = "noteに下書き保存";
  noteButtons.appendChild(noteSubmit);
  noteForm.append(
    workflowField("アカウント", noteAccount),
    workflowField("タイトル", noteTitle),
    workflowField("本文", noteBody),
    noteButtons,
  );
  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = noteTitle.value.trim();
    const body = noteBody.value.trim();
    if (!title && !body) return;
    noteSubmit.disabled = true;
    await runWorkflow("/api/workflows/note-draft", { account: noteAccount.value, title, body }, "noteの下書きを保存しました");
    noteSubmit.disabled = false;
  });
  noteCard.appendChild(noteForm);

  artifactList.append(xCard, xArticleCard, noteCard);
}

function addAutomationCard(automation) {
  const row = document.createElement("article");
  row.className = "automation-card";

  const title = document.createElement("strong");
  title.textContent = automation.name;

  const details = document.createElement("small");
  details.textContent = [
    automation.status,
    automation.kind,
    humanSchedule(automation.rrule),
    automation.executionEnvironment,
    automation.model,
    automation.cwds?.[0] ? shortPath(automation.cwds[0]) : automation.targetThreadId ? `thread ${automation.targetThreadId.slice(0, 8)}` : "",
  ].filter(Boolean).join(" / ");

  const promptPreview = document.createElement("p");
  promptPreview.className = "automation-prompt-preview";
  promptPreview.textContent = automation.prompt || "本文なし";

  const controls = document.createElement("div");
  controls.className = "automation-controls";

  const time = document.createElement("input");
  time.type = "time";
  time.value = timeFromRrule(automation.rrule);
  time.disabled = !automation.rrule?.includes("FREQ=DAILY");

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save time";
  save.disabled = time.disabled;
  save.addEventListener("click", () => updateAutomation(automation.id, { dailyTime: time.value }));

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = automation.status === "ACTIVE" ? "Pause" : "Resume";
  toggle.addEventListener("click", () => updateAutomation(automation.id, { status: automation.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }));

  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "Open";
  edit.addEventListener("click", () => showAutomationEditor(automation));

  controls.append(time, save, toggle, edit);
  row.append(title, details, promptPreview, controls);
  artifactList.appendChild(row);
}

function formField(label, input) {
  const wrap = document.createElement("label");
  wrap.className = "automation-field";
  const title = document.createElement("span");
  title.textContent = label;
  wrap.append(title, input);
  return wrap;
}

function showAutomationEditor(automation) {
  clearPanel("オートメーション編集");
  artifactList.replaceChildren();

  const form = document.createElement("form");
  form.className = "automation-editor";

  const name = document.createElement("input");
  name.value = automation.name || "";

  const status = document.createElement("select");
  for (const value of ["ACTIVE", "PAUSED"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value === "ACTIVE" ? "有効" : "一時停止";
    option.selected = automation.status === value;
    status.appendChild(option);
  }

  const prompt = document.createElement("textarea");
  prompt.rows = 12;
  prompt.value = automation.prompt || "";

  const rrule = document.createElement("input");
  rrule.value = automation.rrule || "";

  const time = document.createElement("input");
  time.type = "time";
  time.value = timeFromRrule(automation.rrule);

  const modelInput = document.createElement("input");
  modelInput.value = automation.model || "";

  const reasoning = document.createElement("select");
  for (const value of ["minimal", "low", "medium", "high", "xhigh"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = automation.reasoningEffort === value;
    reasoning.appendChild(option);
  }

  const meta = document.createElement("div");
  meta.className = "automation-editor-meta";
  meta.textContent = [
    automation.id,
    automation.kind,
    automation.executionEnvironment,
    automation.cwds?.[0] || automation.targetThreadId || "",
  ].filter(Boolean).join(" / ");

  const buttons = document.createElement("div");
  buttons.className = "automation-editor-actions";

  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "一覧へ";
  back.addEventListener("click", showAutomations);

  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "保存";

  const applyTime = document.createElement("button");
  applyTime.type = "button";
  applyTime.textContent = "時刻をRRULEへ反映";
  applyTime.addEventListener("click", () => {
    if (!time.value) return;
    const [hour, minute] = time.value.split(":").map((part) => String(Number(part)));
    rrule.value = `FREQ=DAILY;BYHOUR=${hour};BYMINUTE=${minute};BYSECOND=0`;
  });

  buttons.append(back, applyTime, save);
  form.append(
    meta,
    formField("名前", name),
    formField("状態", status),
    formField("本文", prompt),
    formField("スケジュール", rrule),
    formField("毎日の時刻", time),
    formField("モデル", modelInput),
    formField("推論", reasoning),
    buttons,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateAutomation(automation.id, {
      name: name.value.trim(),
      status: status.value,
      prompt: prompt.value,
      rrule: rrule.value.trim(),
      model: modelInput.value.trim(),
      reasoningEffort: reasoning.value,
    });
    await showAutomations();
  });

  artifactList.appendChild(form);
}

async function updateAutomation(id, patch) {
  try {
    await apiPost("/api/automation/update", { id, ...patch });
    addStatus("Automation updated");
    await showAutomations();
  } catch (error) {
    addEntry("error", `Automation update failed: ${error.message}`);
  }
}

function humanSchedule(rrule) {
  if (!rrule) return "";
  const hour = rrule.match(/BYHOUR=(\d+)/)?.[1];
  const minute = rrule.match(/BYMINUTE=(\d+)/)?.[1] || "0";
  if (rrule.includes("FREQ=DAILY") && hour) return `daily ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  return rrule;
}

function timeFromRrule(rrule) {
  const hour = rrule?.match(/BYHOUR=(\d+)/)?.[1];
  const minute = rrule?.match(/BYMINUTE=(\d+)/)?.[1] || "0";
  if (!hour) return "";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function shortPath(value) {
  return String(value || "").split(/[\\/]/).filter(Boolean).slice(-2).join("/");
}

async function showSettings() {
  const renderSeq = ++settingsRenderSeq;
  clearPanel("設定");
  artifactList.replaceChildren();
  renderThemeSettings();
  const loadingRow = addPanelRow("読み込み中...");
  try {
    const result = await apiGet("/api/config");
    if (renderSeq !== settingsRenderSeq) return;
    loadingRow.remove();
    const config = result.config?.config || {};
    addPanelRow("認証", result.auth?.authMethod || "unknown");
    addPanelRow("既定モデル", config.model || selectedModel || "unknown");
    addPanelRow("承認", accessMode.approvalPolicy);
    addPanelRow("サンドボックス", accessMode.sandboxMode);
    addPanelRow("作業ディレクトリ", config.cwd || "");
    if (result.errors?.length) addPanelRow("補足エラー", result.errors.join(" / "));
  } catch (error) {
    if (renderSeq !== settingsRenderSeq) return;
    loadingRow.remove();
    addPanelRow("読み込みに失敗しました", error.message);
    addEntry("error", `設定: ${error.message}`);
  }
}

function renderThemeSettings() {
  const group = document.createElement("section");
  group.className = "theme-settings";

  const title = document.createElement("div");
  title.className = "theme-settings-title";
  title.textContent = "カラーテーマ";
  group.appendChild(title);

  const options = document.createElement("div");
  options.className = "theme-options";
  for (const theme of themeOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = selectedTheme === theme.id ? "theme-option active" : "theme-option";
    button.dataset.themeChoice = theme.id;
    button.innerHTML = `
      <span class="theme-swatch" aria-hidden="true"><span></span><span></span><span></span></span>
      <strong>${escapeHtml(theme.name)}</strong>
      <small>${escapeHtml(theme.detail)}</small>
    `;
    button.addEventListener("click", () => {
      applyTheme(theme.id);
      addStatus(`テーマを ${theme.name} に切り替えました。`);
      showSettings();
    });
    options.appendChild(button);
  }
  group.appendChild(options);
  artifactList.appendChild(group);
}

async function showModels() {
  clearPanel("モデル");
  addPanelRow("読み込み中...");
  try {
    const result = await apiGet("/api/models");
    artifactList.replaceChildren();
    const models = result.data || [];
    for (const candidate of models.slice(0, 24)) {
      addPanelRow(candidate.displayName || candidate.model || candidate.id, candidate.defaultReasoningEffort || "", () => {
        selectedModel = candidate.model || candidate.id;
        selectedModelLabel = (candidate.displayName || selectedModel).replace(/^GPT-/, "").replace(/^gpt-/, "");
        localStorage.setItem("codexPhoneModel", selectedModel);
        localStorage.setItem("codexPhoneModelLabel", selectedModelLabel);
        updateModelButton();
        addStatus(`モデルを ${selectedModel} に設定しました。次の送信から反映します。`);
      });
    }
    if (!models.length) addPanelRow("モデル一覧を取得できませんでした");
  } catch (error) {
    showToolError("モデル", error);
  }
}

function startVoiceInput() {
  voiceButton.dataset.voiceState = "requested";
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceButton.dataset.voiceState = "unsupported";
    addStatus("このブラウザでは音声入力APIが使えません。");
    promptInput.focus();
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = document.documentElement.lang || "ja-JP";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  voiceButton.classList.add("listening");
  addStatus("音声入力を開始しました。ブラウザのマイク許可を確認してください。");
  recognition.addEventListener("result", (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    if (!transcript) return;
    promptInput.value = `${promptInput.value}${promptInput.value ? "\n" : ""}${transcript}`;
    promptInput.focus();
    addStatus("音声入力をテキストへ追加しました。");
  });
  recognition.addEventListener("error", (event) => addStatus(`音声入力に失敗しました: ${event.error || "unknown"}`));
  recognition.addEventListener("end", () => voiceButton.classList.remove("listening"));
  recognition.start();
}

async function showStatus() {
  clearPanel("バックグラウンド");
  try {
    const result = await apiGet("/api/status");
    const auth = result.auth || {};
    const quota = auth.quota || auth.rateLimits || auth.limits || auth.usage || result.config?.quota || null;
    addPanelRow("認証", auth.authMethod || auth.status || "unknown");
    if (auth.planType || auth.plan || auth.accountType) addPanelRow("プラン", auth.planType || auth.plan || auth.accountType);
    if (quota) {
      const rows = typeof quota === "object" ? Object.entries(quota) : [["残量", quota]];
      for (const [key, value] of rows.slice(0, 8)) {
        addPanelRow(`Rate ${key}`, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
    } else {
      addPanelRow("レート残量", "Codex APIから残量が返らない場合は表示不可");
    }
    for (const error of result.statusErrors || []) addPanelRow("状態取得の補足", error);
    addPanelRow("UI port", String(result.uiPort));
    addPanelRow("Codex app-server", result.codexUrl);
    addPanelRow("履歴同期", result.historySyncEnabled ? "有効" : "無効");
    addPanelRow("作業ディレクトリ", result.workdir);
    for (const bridge of result.bridges || []) {
      const workState = bridge.active ? "裏で作業中" : bridge.ready ? "待機中" : "起動中";
      const queue = bridge.queued ? ` / 待ち ${bridge.queued}` : "";
      addPanelRow(bridge.threadId || "thread準備中", `${bridge.clients}端末 / ${workState}${queue}`);
    }
  } catch (error) {
    showToolError("バックグラウンド", error);
  }
}

async function showArtifact(path) {
  showRightPanel();
  artifactTitle.textContent = "アーティファクト";
  artifactList.classList.add("artifact-browser-list");
  activeArtifactPath = path;
  renderArtifactRows();
  artifactPreview.className = "artifact-preview";
  artifactPreview.innerHTML = `
    <div class="artifact-preview-header">
      <div class="artifact-preview-title">${escapeHtml(path)}</div>
      <button type="button" class="artifact-preview-close" data-preview-close>閉じる</button>
    </div>
    <p>読み込み中...</p>
  `;
  try {
    const query = new URLSearchParams();
    query.set("path", path);
    if (selectedThread) query.set("thread", selectedThread);
    const result = await apiGet(`/api/file?${query.toString()}`);
    setArtifactPreview(result);
    artifactPreview.classList.remove("hidden");
  } catch (error) {
    artifactPreview.innerHTML = `
      <div class="artifact-preview-header">
        <div class="artifact-preview-title">${escapeHtml(path)}</div>
        <button type="button" class="artifact-preview-close" data-preview-close>閉じる</button>
      </div>
      <p>読み込みに失敗しました: ${escapeHtml(error.message)}</p>
    `;
    addEntry("error", `アーティファクト: ${error.message}`);
  }
}

function setArtifactPreview(result) {
  currentArtifactResult = result;
  const isImage = result.kind === "image";
  const isMarkdown = result.kind === "markdown" || /\.md(?:own)?$/i.test(result.path);
  artifactPreview.classList.toggle("image-artifact-preview", isImage);
  artifactPreview.classList.toggle("markdown-preview", isMarkdown);
  artifactPreview.classList.toggle("plain-preview", !isMarkdown && !isImage);
  const header = `
    <div class="artifact-preview-header">
      <div class="artifact-preview-title">${escapeHtml(result.path)}</div>
      <button type="button" class="artifact-preview-close" data-preview-close>閉じる</button>
    </div>
  `;
  if (isImage) {
    artifactPreview.innerHTML = header;
    const gallery = renderImageGallery([{ name: result.path, url: authenticatedResourceUrl(result.imageUrl) }]);
    artifactPreview.appendChild(gallery);
    return;
  }
  const editAction = result.editable ? `<button type="button" class="artifact-preview-close" data-edit-file>編集</button>` : "";
  const textHeader = `
    <div class="artifact-preview-header">
      <div class="artifact-preview-title">${escapeHtml(result.path)}</div>
      <div class="artifact-preview-actions">
        ${editAction}
        <button type="button" class="artifact-preview-close" data-preview-close>閉じる</button>
      </div>
    </div>
  `;
  artifactPreview.innerHTML = `${textHeader}${
    isMarkdown ? renderMarkdown(result.text, { allowHtml: true, headingOffset: 0 }) : `<pre><code>${escapeHtml(result.text)}</code></pre>`
  }`;
}

function startArtifactEdit() {
  if (!currentArtifactResult?.editable) return;
  artifactPreview.classList.remove("markdown-preview", "plain-preview", "image-artifact-preview");
  artifactPreview.classList.add("file-editor-preview");
  artifactPreview.innerHTML = `
    <div class="artifact-preview-header">
      <div class="artifact-preview-title">${escapeHtml(currentArtifactResult.path)}</div>
      <div class="artifact-preview-actions">
        <button type="button" class="artifact-preview-close" data-cancel-edit>取消</button>
        <button type="button" class="artifact-preview-close primary" data-save-file>保存</button>
      </div>
    </div>
    <textarea class="file-editor-textarea" spellcheck="false">${escapeHtml(currentArtifactResult.text || "")}</textarea>
  `;
  artifactPreview.querySelector(".file-editor-textarea")?.focus();
}

async function saveArtifactEdit() {
  if (!currentArtifactResult?.editable) return;
  const textarea = artifactPreview.querySelector(".file-editor-textarea");
  const nextText = textarea?.value ?? "";
  const saveButton = artifactPreview.querySelector("[data-save-file]");
  if (saveButton) saveButton.disabled = true;
  try {
    const result = await apiPost("/api/file/save", {
      path: currentArtifactResult.path,
      text: nextText,
      modifiedAt: currentArtifactResult.modifiedAt,
      thread: selectedThread || undefined,
    });
    setArtifactPreview(result);
    addStatus(`保存しました: ${result.path}`);
  } catch (error) {
    addEntry("error", `保存に失敗しました: ${error.message}`);
    if (saveButton) saveButton.disabled = false;
  }
}

function renderAttachments() {
  attachments.replaceChildren();
  attachments.classList.toggle("has-attachments", pendingFiles.length > 0);
  for (const file of pendingFiles) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "attachment-chip";
    const thumb = document.createElement("img");
    thumb.src = file.dataUrl;
    thumb.alt = "";
    const label = document.createElement("span");
    label.textContent = file.name;
    const close = document.createElement("span");
    close.textContent = "×";
    chip.append(thumb, label, close);
    chip.addEventListener("click", () => {
      pendingFiles = pendingFiles.filter((candidate) => candidate !== file);
      renderAttachments();
    });
    attachments.appendChild(chip);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function scheduleReconnect(reason = "") {
  if (!token || reconnectTimer) return;
  const delay = Math.min(30_000, 1200 * 2 ** Math.min(reconnectAttempts, 5));
  reconnectAttempts += 1;
  setRunState("disconnected", `切断。${Math.round(delay / 1000)}秒後に再接続`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect({ automatic: true });
  }, delay);
  if (reason) addStatus(`再接続を待機中: ${reason}`);
}

function connect({ automatic = false } = {}) {
  if (!token) {
    addEntry("error", "URLに token がありません。Mac側に表示されたURLをそのまま開いてください。");
    return;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    intentionalClose = true;
    ws.__manualClose = true;
    ws.close();
  }
  intentionalClose = false;
  liveTurnActive = false;
  setRunState("connecting");
  lastHistorySignature = "";
  if (!automatic && !selectedThread) renderHistory([]);
  const selected = threadCache.find((thread) => thread.id === selectedThread);
  threadTitle.textContent = selected ? titleForThread(selected) : "新しい共有thread";

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const threadParam = selectedThread ? `&thread=${encodeURIComponent(selectedThread)}` : "";
  ws = new WebSocket(
    `${proto}//${location.host}/bridge?token=${encodeURIComponent(token)}&device=${encodeURIComponent(deviceId)}${threadParam}`,
  );
  const socket = ws;
  connectButton.disabled = true;
  meta.textContent = "接続中";

  ws.addEventListener("open", () => {
    updateStopButton();
    setRunState("connecting", "Codex に接続中");
    addEntry("status", "Macの共有ブリッジへ接続しました。");
  });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ready") {
      reconnectAttempts = 0;
      setReady(true);
      syncReadyThread(msg.threadId);
      if (msg.threadId) localStorage.setItem("codexPhoneLastThread", msg.threadId);
      renderHistoryIfChanged(msg.history || []);
      meta.textContent = `${msg.model}  •  ${msg.clients}端末  •  ${msg.workdir}`;
      setRunState("ready");
      updateStopButton();
      addEntry("status", `共有Codex thread ready: ${msg.threadId}`);
      return;
    }
    if (msg.type === "artifact" && msg.artifact) {
      loadArtifacts();
      if (msg.artifact.type === "image" || msg.artifact.type === "screenshot") {
        if (rememberArtifactPreview(msg.artifact.path, "ws")) return;
        const label = msg.artifact.type === "screenshot" ? "スクショを受け取りました。" : "画像を受け取りました。";
        addEntry("assistant", label, [artifactImageForGallery(msg.artifact)].filter(Boolean));
        if (isRightPanelOpen()) {
          artifactPreview.className = "artifact-preview";
          artifactPreview.classList.remove("hidden");
          setArtifactPreview({
            path: msg.artifact.path,
            kind: "image",
            imageUrl: msg.artifact.url,
          });
        }
        addStatus(msg.artifact.type === "screenshot" ? "スクショを受け取りました。" : "画像を受け取りました。");
      }
      return;
    }
    if (msg.type === "queued") {
      setRunState("running", "待機中");
      addStatus(`待機に入りました: ${previewText(msg.text)}`);
      return;
    }
    if (msg.type === "user") {
      liveTurnActive = true;
      assistantEntry = null;
      setRunState("running");
      updateStopButton();
      addEntry("user", msg.text, msg.attachments || []);
      return;
    }
    if (msg.type === "assistantDelta") {
      setRunState("streaming");
      if (!assistantEntry) assistantEntry = addEntry("assistant", "");
      setEntryText(assistantEntry, "assistant", `${assistantEntry.markdownSource || ""}${msg.text}`);
      log.scrollTop = log.scrollHeight;
      return;
    }
    if (msg.type === "approval") {
      pendingApproval = msg.request;
      setRunState("approval");
      updateStopButton();
      approvalText.textContent = JSON.stringify(msg.request.params, null, 2);
      approval.classList.remove("hidden");
      return;
    }
    if (msg.type === "turn" && msg.status === "started") {
      liveTurnActive = true;
      updateStopButton();
      return;
    }
    if (msg.type === "turn" && msg.status === "stopped") {
      liveTurnActive = false;
      pendingApproval = null;
      approval.classList.add("hidden");
      assistantEntry = null;
      setRunState("done", "停止しました");
      updateStopButton();
      refreshSelectedThread();
      loadArtifacts();
      return;
    }
    if (msg.type === "turn" && msg.status === "completed") {
      liveTurnActive = false;
      pendingApproval = null;
      updateStopButton();
      lastHistorySignature = "";
      assistantEntry = null;
      setRunState("done", "完了しました");
      loadThreads();
      refreshSelectedThread();
      loadArtifacts();
      return;
    }
    if (msg.type === "error") {
      setRunState("error", msg.text || "エラー");
      addEntry("error", msg.text);
      return;
    }
    if (msg.type === "status") {
      if (/履歴同期を更新しました/.test(msg.text || "")) setRunState("done", "完了・履歴同期済み");
      else if (/履歴同期に失敗/.test(msg.text || "")) setRunState("error", "履歴同期に失敗");
      else if (/履歴同期/.test(msg.text || "")) setRunState("syncing", msg.text);
      addEntry("status", msg.text);
    }
  });

  ws.addEventListener("close", () => {
    if (ws !== socket) return;
    setReady(false);
    liveTurnActive = false;
    pendingApproval = null;
    updateStopButton();
    connectButton.disabled = false;
    meta.textContent = "切断";
    setRunState("disconnected", "切断。PC側の作業は継続します");
    if (!intentionalClose && !socket.__manualClose) scheduleReconnect("WebSocket closed");
  });
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendComposerMessage(liveTurnActive ? "followup" : "prompt");
});

approveButton.addEventListener("click", () => {
  if (!pendingApproval) return;
  ws.send(JSON.stringify({ type: "approval", token, decision: "accept", request: pendingApproval }));
  approval.classList.add("hidden");
  pendingApproval = null;
  updateStopButton();
  setRunState("running", "承認済み・処理中");
});

declineButton.addEventListener("click", () => {
  if (!pendingApproval) return;
  ws.send(JSON.stringify({ type: "approval", token, decision: "decline", request: pendingApproval }));
  approval.classList.add("hidden");
  pendingApproval = null;
  updateStopButton();
  setRunState("running", "拒否済み・処理中");
});

newThreadButton.addEventListener("click", () => selectThread(""));
searchButton.addEventListener("click", () => {
  threadSearch.classList.toggle("hidden");
  threadSearch.focus();
  renderThreadList();
  document.body.classList.add("show-sidebar");
});
threadSearch.addEventListener("input", renderThreadList);
loadAppInfo().then(() => {
  if (!appInfo.productMode) {
    ensureWorkflowButton();
    workflowButton?.addEventListener("click", showWorkflows);
  }
});
pluginsButton.addEventListener("click", showPlugins);
automationsButton.addEventListener("click", showAutomations);
settingsButton.addEventListener("click", showSettings);
mobileThreadsButton.addEventListener("click", () => document.body.classList.toggle("show-sidebar"));
sidebarScrim.addEventListener("click", () => document.body.classList.remove("show-sidebar"));
connectButton.addEventListener("click", connect);
menuButton.addEventListener("click", () => {
  const desktopPanelVisible =
    window.matchMedia("(min-width: 1101px)").matches && !document.body.classList.contains("hide-artifacts");
  const mobilePanelVisible = document.body.classList.contains("show-panel");
  if (desktopPanelVisible || mobilePanelVisible) {
    closeRightPanel();
    addStatus("右パネルを閉じました。");
  } else {
    showRightPanel();
    addStatus("右パネルを開きました。");
  }
});
closePanelButton.addEventListener("click", closeRightPanel);
artifactPreview.addEventListener("click", (event) => {
  if (event.target.closest("[data-preview-close]")) hideArtifactPreview();
  if (event.target.closest("[data-edit-file]")) startArtifactEdit();
  if (event.target.closest("[data-cancel-edit]")) setArtifactPreview(currentArtifactResult);
  if (event.target.closest("[data-save-file]")) saveArtifactEdit();
});
addButton.addEventListener("click", () => fileInput.click());
imageButton.addEventListener("click", () => {
  promptInput.value = `${promptInput.value}${promptInput.value ? "\n" : ""}画像を生成して。完成した画像は docs/assets か tmp/generated-images に保存して、スマホのアーティファクト/プレビューで確認できるようにして。`;
  promptInput.focus();
});
fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []).filter((file) => file.type.startsWith("image/"));
  try {
    pendingFiles = pendingFiles.concat(await Promise.all(files.map(readFileAsDataUrl)));
    renderAttachments();
    if (files.length) addStatus(`${files.length}件の画像を添付しました。送信時にCodexへ渡します。`);
  } catch (error) {
    addEntry("error", `添付に失敗しました: ${error.message}`);
  } finally {
    fileInput.value = "";
    updateComposerActions();
  }
});
promptInput.addEventListener("input", updateComposerActions);
stopButton?.addEventListener("click", () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "stop", token }));
  liveTurnActive = false;
  pendingApproval = null;
  approval.classList.add("hidden");
  setRunState("done", "停止中...");
  updateStopButton();
});
accessButton.addEventListener("click", () => {
  const index = accessModes.findIndex((candidate) => candidate.label === accessMode.label);
  accessMode = accessModes[(index + 1) % accessModes.length];
  accessButton.textContent = accessMode.label;
  addStatus(`権限を ${accessMode.label} に切り替えました。次の送信から反映します。`);
});
thinkingButton?.addEventListener("click", toggleModelMenu);
modelButton.addEventListener("click", toggleModelMenu);
voiceButton.addEventListener("click", startVoiceInput);
modelMenu.addEventListener("click", (event) => {
  const reasoningRow = event.target.closest("[data-reasoning]");
  if (reasoningRow) {
    selectReasoning(reasoningRow.dataset.reasoning);
    return;
  }
  const speedRow = event.target.closest("[data-speed]");
  if (speedRow) {
    selectSpeed(speedRow.dataset.speed);
    return;
  }
  const modelRow = event.target.closest("[data-model-choice]");
  if (modelRow) {
    selectModel(modelRow.dataset.modelChoice);
    return;
  }
  if (event.target.closest("#moreModelsButton")) {
    closeModelMenu();
    showModels();
  }
});
document.addEventListener("click", (event) => {
  if (modelMenu.classList.contains("hidden")) return;
  if (modelMenu.contains(event.target) || modelButton.contains(event.target) || thinkingButton?.contains(event.target)) return;
  closeModelMenu();
});
statusButton.addEventListener("click", showStatus);
const folderButton = document.createElement("button");
folderButton.type = "button";
folderButton.className = "terminal-row";
folderButton.textContent = "フォルダ";
folderButton.addEventListener("click", () => showFolder(""));
terminalList?.appendChild(folderButton);
previewButton.addEventListener("click", () => showPreviewTools());
webSearchButton.addEventListener("click", () => {
  promptInput.value = `${promptInput.value}${promptInput.value ? "\n" : ""}Web調査を使って確認してください。`;
  promptInput.focus();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  restoreSessionState()
    .catch(() => {})
    .finally(() => {
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) connect({ automatic: true });
      loadThreads({ background: true }).catch(() => {});
      refreshSelectedThread();
      loadArtifacts();
    });
});
for (const button of artifactButtons) {
  button.addEventListener("click", () => {
    for (const candidate of artifactButtons) candidate.classList.toggle("active", candidate === button);
    showArtifact(button.dataset.artifact);
  });
}

setReady(false);
updateModelButton();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
registerDevice()
  .then(restoreSessionState)
  .then(loadArtifacts)
  .then(() => loadThreads({ background: true }))
  .catch(() => {})
  .finally(connect);
setInterval(() => loadThreads({ background: true }), 10_000);
setInterval(refreshSelectedThread, 3_000);
