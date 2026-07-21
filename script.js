const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const templates = {
  cream: { paper: "#fffdf7", ink: "#282620", accent: "#111111", font: "batang", size: 18, leading: 1.9 },
  blue: { paper: "#e5f0f3", ink: "#263e4b", accent: "#111111", font: "myeongjo", size: 18, leading: 1.9 },
  midnight: { paper: "#19222d", ink: "#f0e8d7", accent: "#ffffff", font: "batang", size: 18, leading: 2 },
  dot: { paper: "#f5dfd4", ink: "#4d352f", accent: "#111111", font: "sans", size: 17, leading: 1.85 },
  flower: { paper: "#fffafc", ink: "#46373e", accent: "#b74870", font: "batang", size: 18, leading: 1.9 },
  cute: { paper: "#fff8fd", ink: "#493b55", accent: "#7256b8", font: "sans", size: 17, leading: 1.85 },
};

const fontMap = {
  batang: 'Pretendard, "Apple SD Gothic Neo", sans-serif',
  myeongjo: 'Pretendard, "Apple SD Gothic Neo", sans-serif',
  sans: 'Pretendard, "Apple SD Gothic Neo", sans-serif',
};

const weightMap = { batang: 400, myeongjo: 300, sans: 650 };

const limits = Object.freeze({ recipient: 40, title: 80, body: 5000, sender: 40, date: 40 });
const allowedTemplates = new Set([...Object.keys(templates), "custom"]);
const allowedFonts = new Set(Object.keys(fontMap));
const hexColorPattern = /^#[0-9a-f]{6}$/i;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const maxSharedValueLength = 32000;
const maxDecodedBytes = 24000;

const defaultState = {
  template: "cream",
  recipient: "",
  title: "",
  body: "",
  sender: "",
  style: { ...templates.cream },
  date: new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date()),
};

let state = loadDraft();
let saveTimer;
let toastTimer;

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function cleanColor(value, fallback) {
  return typeof value === "string" && hexColorPattern.test(value) ? value.toLowerCase() : fallback;
}

function cleanNumber(value, min, max, fallback, precision = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clamped = Math.min(max, Math.max(min, numeric));
  const factor = 10 ** precision;
  return Math.round(clamped * factor) / factor;
}

function sanitizeLetter(raw, { requireContent = false } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const template = allowedTemplates.has(raw.template) ? raw.template : "cream";
  const baseStyle = templates[template] || templates.cream;
  const rawStyle = raw.style && typeof raw.style === "object" && !Array.isArray(raw.style) ? raw.style : {};
  const letter = {
    template,
    recipient: cleanString(raw.recipient, limits.recipient),
    title: cleanString(raw.title, limits.title),
    body: cleanString(raw.body, limits.body),
    sender: cleanString(raw.sender, limits.sender),
    date: cleanString(raw.date, limits.date) || defaultState.date,
    style: {
      paper: cleanColor(rawStyle.paper, baseStyle.paper),
      ink: cleanColor(rawStyle.ink, baseStyle.ink),
      accent: cleanColor(rawStyle.accent, baseStyle.accent),
      font: allowedFonts.has(rawStyle.font) ? rawStyle.font : baseStyle.font,
      size: cleanNumber(rawStyle.size, 15, 23, baseStyle.size),
      leading: cleanNumber(rawStyle.leading, 1.5, 2.3, baseStyle.leading, 1),
    },
  };

  if (requireContent && (!letter.recipient.trim() || !letter.body.trim() || !letter.sender.trim())) return null;
  return letter;
}

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem("cssletter.draft"));
    if (!saved) return structuredClone(defaultState);
    const next = sanitizeLetter(saved) || structuredClone(defaultState);
    if (["#e76f51", "#ff4f2e", "#b25443", "#d2a95f", "#4f7e94"].includes(next.style.accent?.toLowerCase())) {
      next.style.accent = next.template === "midnight" ? "#ffffff" : "#111111";
    }
    return next;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveDraft() {
  clearTimeout(saveTimer);
  $("#saveStatus").textContent = "저장 중…";
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem("cssletter.draft", JSON.stringify(sanitizeLetter(state) || defaultState));
      $("#saveStatus").textContent = "저장됨";
    } catch {
      $("#saveStatus").textContent = "저장할 수 없음";
    }
  }, 350);
}

function setPaperStyle(element, style, template = "custom") {
  element.classList.remove("theme-cream", "theme-blue", "theme-midnight", "theme-dot", "theme-flower", "theme-cute");
  if (template in templates) element.classList.add(`theme-${template}`);
  element.style.setProperty("--letter-paper", style.paper);
  element.style.setProperty("--letter-ink", style.ink);
  element.style.setProperty("--letter-accent", style.accent);
  element.style.setProperty("--letter-font", fontMap[style.font] || fontMap.batang);
  element.style.setProperty("--letter-weight", weightMap[style.font] || 400);
  element.style.setProperty("--letter-size", `${style.size}px`);
  element.style.setProperty("--letter-leading", style.leading);
}

function applyState() {
  $("#recipient").value = state.recipient;
  $("#letterTitle").value = state.title;
  $("#letterBody").value = state.body;
  $("#sender").value = state.sender;
  $("#letterDate").textContent = state.date;
  setPaperStyle($("#letterPaper"), state.style, state.template);
  syncCustomControls();
  $$(".paper-option").forEach((button) => {
    const selected = button.dataset.template === state.template;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function syncCustomControls() {
  const values = { paperColor: state.style.paper, inkColor: state.style.ink, accentColor: state.style.accent };
  Object.entries(values).forEach(([id, value]) => {
    $(`#${id}`).value = value;
    $(`#${id}Value`).textContent = value.toUpperCase();
  });
  $("#fontSelect").value = state.style.font;
  $("#fontSize").value = state.style.size;
  $("#fontSizeValue").textContent = state.style.size;
  $("#lineHeight").value = state.style.leading;
  $("#lineHeightValue").textContent = state.style.leading;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function setTab(name) {
  $$(".tab").forEach((button) => {
    const active = button.dataset.tab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === name));
}

function openModal(id) {
  const modal = $(id);
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(modal) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function encodeLetter(data) {
  const safeLetter = sanitizeLetter(data, { requireContent: true });
  if (!safeLetter) return null;
  const json = JSON.stringify(safeLetter);
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > maxDecodedBytes) return null;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return encoded.length <= maxSharedValueLength ? encoded : null;
}

function decodeLetter(value) {
  try {
    if (typeof value !== "string" || !value || value.length > maxSharedValueLength || !base64UrlPattern.test(value)) return null;
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const base64 = normalized + padding;
    const binary = atob(base64);
    if (binary.length > maxDecodedBytes) return null;
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return sanitizeLetter(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), { requireContent: true });
  } catch {
    return null;
  }
}

function validateLetter() {
  if (!state.recipient.trim()) { $("#recipient").focus(); showToast("받는 사람의 이름을 적어주세요."); return false; }
  if (!state.body.trim()) { $("#letterBody").focus(); showToast("전하고 싶은 마음을 조금만 적어주세요."); return false; }
  if (!state.sender.trim()) { $("#sender").focus(); showToast("보내는 사람의 이름을 적어주세요."); return false; }
  return true;
}

function createShareLink() {
  if (!validateLetter()) return;
  state.date = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const encoded = encodeLetter(state);
  if (!encoded) return showToast("편지 링크를 만들 수 없어요. 내용을 조금 줄여주세요.");
  const link = `${location.href.split("#")[0]}#letter=${encoded}`;
  $("#shareLink").value = link;
  $("#linkRecipient").textContent = state.recipient;
  openModal("#linkModal");
}

function renderPreview() {
  const mini = $("#miniLetter");
  setPaperStyle(mini, state.style, state.template);
  $("#miniTo").textContent = `To. ${state.recipient || "받는 사람"}`;
  $("#miniTitle").textContent = state.title || "마음을 담은 편지";
  $("#miniBody").textContent = state.body || "아직 편지 내용이 없어요.";
  $("#miniFrom").textContent = `From. ${state.sender || "보내는 사람"}`;
  openModal("#previewModal");
}

function renderReader(letter) {
  const reader = $("#readerApp");
  const readerTemplate = letter.template in templates ? letter.template : "cream";
  $("#editorApp").hidden = true;
  [...reader.classList].filter((name) => name.startsWith("reader-theme-")).forEach((name) => reader.classList.remove(name));
  reader.classList.add(`reader-theme-${readerTemplate}`);
  reader.hidden = false;
  $("#introRecipient").textContent = letter.recipient || "당신";
  $("#introSender").textContent = letter.sender || "누군가";
  $("#readRecipient").textContent = letter.recipient || "당신";
  $("#readTitle").textContent = letter.title || "마음을 담은 편지";
  $("#readBody").textContent = letter.body || "";
  $("#readSender").textContent = letter.sender || "누군가";
  $("#readDate").textContent = letter.date || "";
  setPaperStyle($("#readerPaper"), letter.style || templates.cream, readerTemplate);
  document.title = `${letter.recipient || "당신"}에게 도착한 편지 — CSSLetter`;
}

function initEditor() {
  applyState();
  ["recipient", "letterTitle", "letterBody", "sender"].forEach((id) => {
    $(`#${id}`).addEventListener("input", (event) => {
      const key = id === "letterTitle" ? "title" : id === "letterBody" ? "body" : id;
      state[key] = event.target.value;
      saveDraft();
    });
  });

  $$(".tab").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
  $$(".paper-option").forEach((button) => button.addEventListener("click", () => {
    state.template = button.dataset.template;
    state.style = { ...templates[state.template] };
    applyState();
    saveDraft();
  }));

  const colorInputs = { paperColor: "paper", inkColor: "ink", accentColor: "accent" };
  Object.entries(colorInputs).forEach(([id, key]) => $(`#${id}`).addEventListener("input", (event) => {
    state.template = "custom";
    state.style[key] = event.target.value;
    $(`#${id}Value`).textContent = event.target.value.toUpperCase();
    setPaperStyle($("#letterPaper"), state.style);
    saveDraft();
  }));
  $("#fontSelect").addEventListener("change", (event) => { state.template = "custom"; state.style.font = event.target.value; setPaperStyle($("#letterPaper"), state.style); saveDraft(); });
  $("#fontSize").addEventListener("input", (event) => { state.template = "custom"; state.style.size = Number(event.target.value); $("#fontSizeValue").textContent = state.style.size; setPaperStyle($("#letterPaper"), state.style); saveDraft(); });
  $("#lineHeight").addEventListener("input", (event) => { state.template = "custom"; state.style.leading = Number(event.target.value); $("#lineHeightValue").textContent = state.style.leading; setPaperStyle($("#letterPaper"), state.style); saveDraft(); });

  $("#clearLetter").addEventListener("click", () => {
    if (!state.recipient && !state.title && !state.body && !state.sender) return showToast("이미 깨끗한 편지예요.");
    if (!confirm("작성한 편지 내용을 모두 지울까요?")) return;
    state = structuredClone(defaultState);
    applyState();
    localStorage.removeItem("cssletter.draft");
    showToast("새 편지를 준비했어요.");
  });
  $("#togglePreview").addEventListener("click", renderPreview);
  $("#createLinkTop").addEventListener("click", createShareLink);
  $("#createLinkMobile").addEventListener("click", createShareLink);
  $("#copyLink").addEventListener("click", async () => {
    const link = $("#shareLink").value;
    try { await navigator.clipboard.writeText(link); } catch { $("#shareLink").select(); document.execCommand("copy"); }
    $("#copyLink span").textContent = "복사됨";
    showToast("읽기 링크를 복사했어요.");
    setTimeout(() => { $("#copyLink span").textContent = "복사"; }, 1800);
  });
  $("#openSharedLetter").addEventListener("click", () => {
    try {
      const target = new URL($("#shareLink").value, location.href);
      if (target.origin !== location.origin || target.pathname !== location.pathname || !target.hash.startsWith("#letter=")) throw new Error("Invalid share URL");
      location.href = target.href;
      location.reload();
    } catch {
      showToast("안전한 CSSLetter 링크가 아니에요.");
    }
  });
}

function initCommon() {
  $$('[data-close-modal]').forEach((element) => element.addEventListener("click", () => closeModal(element.closest(".modal"))));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") $$(".modal.is-open").forEach(closeModal);
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !$("#editorApp").hidden) createShareLink();
  });
  window.lucide?.createIcons();
}

const sharedValue = location.hash.startsWith("#letter=") ? location.hash.slice(8) : "";
const sharedLetter = sharedValue ? decodeLetter(sharedValue) : null;

if (sharedLetter) {
  renderReader(sharedLetter);
  $("#openLetter").addEventListener("click", () => {
    $("#readerIntro").hidden = true;
    $("#readerLetterWrap").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
} else {
  if (sharedValue) showToast("편지 링크가 올바르지 않아요. 새 편지를 작성해 주세요.");
  initEditor();
}

initCommon();
