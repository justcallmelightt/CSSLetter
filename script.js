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
const productionShareUrl = "https://cssletter.vercel.app/";
const customPapersKey = "cssletter.customPapers.v1";
const maxCustomPapers = 12;
const maxScheduleYears = 10;

const defaultState = {
  template: "cream",
  recipient: "",
  title: "",
  body: "",
  sender: "",
  futureSelf: false,
  futureSelfBackup: null,
  unlockAt: null,
  style: { ...templates.cream },
  date: new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date()),
};

let state = loadDraft();
let customPapers = loadCustomPapers();
let activeCustomPaperId = null;
let saveTimer;
let toastTimer;
let specialPopupTimer;
let readerCountdownTimer;
let deliveryChoice = "now";
let letterPaperAnimation = null;
let modalReturnFocus = null;

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

function cleanUnlockAt(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 40) return null;
  const time = Date.parse(value);
  const latest = Date.now() + maxScheduleYears * 366 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(time) || time > latest) return null;
  return new Date(time).toISOString();
}

function createLocalId() {
  return crypto.randomUUID?.() || `paper-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizePaperStyle(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return {
    paper: cleanColor(raw.paper, templates.cream.paper),
    ink: cleanColor(raw.ink, templates.cream.ink),
    accent: cleanColor(raw.accent, templates.cream.accent),
    font: allowedFonts.has(raw.font) ? raw.font : templates.cream.font,
    size: cleanNumber(raw.size, 15, 23, templates.cream.size),
    leading: cleanNumber(raw.leading, 1.5, 2.3, templates.cream.leading, 1),
  };
}

function loadCustomPapers() {
  try {
    const raw = JSON.parse(localStorage.getItem(customPapersKey));
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, maxCustomPapers).map((paper) => {
      const style = sanitizePaperStyle(paper?.style);
      const name = cleanString(paper?.name, 24).trim();
      if (!style || !name) return null;
      return { id: cleanString(paper.id, 80) || createLocalId(), name, style, createdAt: cleanString(paper.createdAt, 40) || new Date().toISOString() };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function persistCustomPapers() {
  localStorage.setItem(customPapersKey, JSON.stringify(customPapers));
}

function stylesMatch(left, right) {
  return left && right && ["paper", "ink", "accent", "font", "size", "leading"].every((key) => left[key] === right[key]);
}

function renderCustomPapers() {
  const section = $("#savedPapersSection");
  const list = $("#savedPaperList");
  section.hidden = customPapers.length === 0;
  $("#savedPapersCount").textContent = customPapers.length;
  list.replaceChildren();

  customPapers.forEach((paper) => {
    const row = document.createElement("div");
    row.className = "saved-paper-item";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "saved-paper-apply";
    apply.dataset.customPaperId = paper.id;
    apply.setAttribute("aria-pressed", String(activeCustomPaperId === paper.id && stylesMatch(state.style, paper.style)));
    apply.classList.toggle("is-selected", activeCustomPaperId === paper.id && stylesMatch(state.style, paper.style));
    apply.innerHTML = `<span class="custom-paper-thumb" aria-hidden="true"><i>가</i></span><span><strong></strong><small>저장한 커스텀 편지지</small></span>`;
    apply.querySelector("strong").textContent = paper.name;
    const thumb = apply.querySelector(".custom-paper-thumb");
    thumb.style.setProperty("--thumb-paper", paper.style.paper);
    thumb.style.setProperty("--thumb-ink", paper.style.ink);
    thumb.style.setProperty("--thumb-accent", paper.style.accent);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-saved-paper";
    remove.dataset.deleteCustomPaper = paper.id;
    remove.setAttribute("aria-label", `${paper.name} 삭제`);
    remove.innerHTML = `<i data-lucide="trash-2" aria-hidden="true"></i>`;
    row.append(apply, remove);
    list.append(row);
  });
  window.lucide?.createIcons();
}

function saveCurrentPaper() {
  const nameInput = $("#customPaperName");
  const name = cleanString(nameInput.value, 24).trim();
  if (!name) { nameInput.focus(); return showToast("편지지 이름을 적어주세요."); }
  if (customPapers.length >= maxCustomPapers) return showToast(`편지지는 최대 ${maxCustomPapers}개까지 저장할 수 있어요.`);
  const paper = { id: createLocalId(), name, style: { ...sanitizePaperStyle(state.style) }, createdAt: new Date().toISOString() };
  customPapers.unshift(paper);
  activeCustomPaperId = paper.id;
  try { persistCustomPapers(); } catch { return showToast("이 브라우저에 편지지를 저장할 수 없어요."); }
  nameInput.value = "";
  renderCustomPapers();
  setTab("templates");
  showToast(`‘${name}’ 편지지를 저장했어요.`);
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
    futureSelf: raw.futureSelf === true,
    futureSelfBackup: raw.futureSelfBackup && typeof raw.futureSelfBackup === "object" && !Array.isArray(raw.futureSelfBackup)
      ? {
          recipient: cleanString(raw.futureSelfBackup.recipient, limits.recipient),
          sender: cleanString(raw.futureSelfBackup.sender, limits.sender),
          title: cleanString(raw.futureSelfBackup.title, limits.title),
        }
      : null,
    unlockAt: cleanUnlockAt(raw.unlockAt),
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

function animateLetterPaperChange() {
  const paper = $("#letterPaper");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    paper.animate?.([{ opacity: 0.68 }, { opacity: 1 }], { duration: 150, easing: "ease-out" });
    return;
  }
  const computed = getComputedStyle(paper);
  const start = letterPaperAnimation
    ? { opacity: computed.opacity, transform: computed.transform }
    : { opacity: 0.9, transform: "perspective(1200px) rotateY(-2deg) rotateZ(-.3deg)" };
  letterPaperAnimation?.cancel();
  letterPaperAnimation = paper.animate(
    [start, { opacity: 1, transform: "perspective(1200px) rotateY(0) rotateZ(0)" }],
    { duration: 460, easing: "cubic-bezier(.2, .75, .25, 1)", fill: "none" },
  );
}

function applyState() {
  $("#recipient").value = state.recipient;
  $("#letterTitle").value = state.title;
  $("#letterBody").value = state.body;
  $("#sender").value = state.sender;
  const futureSelfButton = $("#futureLetterStart");
  futureSelfButton.setAttribute("aria-pressed", String(state.futureSelf));
  futureSelfButton.setAttribute("aria-label", state.futureSelf ? "미래의 나에게 쓰기 취소" : "미래의 나에게 쓰기");
  futureSelfButton.querySelector("span").textContent = state.futureSelf ? "취소" : "나에게 쓰기";
  $("#letterDate").textContent = state.date;
  setPaperStyle($("#letterPaper"), state.style, state.template);
  syncCustomControls();
  $$(".paper-option").forEach((button) => {
    const selected = button.dataset.template === state.template;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderCustomPapers();
  updateWritingProgress();
}

function updateWritingProgress() {
  const fields = [
    ["recipient", state.recipient.trim()],
    ["body", state.body.trim()],
    ["sender", state.sender.trim()],
  ];
  fields.forEach(([key, value]) => {
    $(`[data-writing-step="${key}"]`).classList.toggle("is-complete", Boolean(value));
  });
  const next = fields.find(([, value]) => !value)?.[0];
  const hints = {
    recipient: "받는 사람을 적으며 시작해보세요.",
    body: "이제 전하고 싶은 이야기를 써보세요.",
    sender: "마지막으로 보내는 사람을 적어주세요.",
  };
  $("#writingHint").textContent = hints[next] || "이제 읽기 링크를 만들 수 있어요.";
  $("#letterLength").textContent = `${state.body.length.toLocaleString("ko-KR")} / 5,000자`;
}

function showEditorError(field, message) {
  const error = $("#editorError");
  error.textContent = message;
  error.hidden = false;
  $(`#${field}`).setAttribute("aria-invalid", "true");
  $(`#${field}`).focus();
}

function toLocalDateTimeValue(isoValue) {
  const date = isoValue ? new Date(isoValue) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function scheduleDateFromNow(preset) {
  const date = new Date();
  const day = date.getDate();
  if (preset === "1year") {
    date.setFullYear(date.getFullYear() + 1);
    if (date.getDate() !== day) date.setDate(0);
    return date;
  }
  const months = preset === "6months" ? 6 : 1;
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
}

function startFutureLetter() {
  if (state.futureSelf) {
    const backup = state.futureSelfBackup;
    if (state.recipient === "미래의 나") state.recipient = backup?.recipient || "";
    if (state.sender === "오늘의 나") state.sender = backup?.sender || "";
    if (state.title === "미래의 나에게" && backup?.title !== undefined) state.title = backup.title;
    state.futureSelf = false;
    state.futureSelfBackup = null;
    state.unlockAt = null;
    deliveryChoice = "now";
    applyState();
    saveDraft();
    showToast("미래 편지 모드를 껐어요. 이미 쓴 내용은 그대로 두었어요.");
    return;
  }
  state.futureSelfBackup = {
    recipient: state.recipient,
    sender: state.sender,
    title: state.title,
  };
  state.futureSelf = true;
  state.recipient = "미래의 나";
  state.sender = "오늘의 나";
  if (!state.title.trim()) state.title = "미래의 나에게";
  state.unlockAt = null;
  deliveryChoice = "now";
  applyState();
  saveDraft();
  showToast("받는 사람과 보낸 사람을 채웠어요. 전달 시점은 링크 만들기에서 선택해요.");
  $("#letterBody").focus({ preventScroll: true });
}

function setSchedulePreset(preset) {
  const date = scheduleDateFromNow(preset);
  const input = $("#shareUnlockAt");
  input.value = toLocalDateTimeValue(date.toISOString());
  $$("[data-schedule-preset]").forEach((button) => {
    const selected = button.dataset.schedulePreset === preset;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function setDeliveryChoice(choice) {
  deliveryChoice = choice === "later" ? "later" : "now";
  $$('[data-delivery-choice]').forEach((button) => {
    const selected = button.dataset.deliveryChoice === deliveryChoice;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  $("#shareScheduleOptions").hidden = deliveryChoice !== "later";
  if (deliveryChoice === "later") $("#shareUnlockAt").focus({ preventScroll: true });
}

function prepareDeliveryStep() {
  const input = $("#shareUnlockAt");
  input.min = toLocalDateTimeValue(new Date(Date.now() + 60 * 1000).toISOString());
  input.max = toLocalDateTimeValue(new Date(Date.now() + maxScheduleYears * 365 * 24 * 60 * 60 * 1000).toISOString());
  const hasFutureSchedule = state.unlockAt && Date.parse(state.unlockAt) > Date.now();
  input.value = toLocalDateTimeValue(hasFutureSchedule ? state.unlockAt : null);
  setDeliveryChoice(hasFutureSchedule ? "later" : "now");
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

function showSpecialPaperPopup(template) {
  const popup = $("#specialPaperPopup");
  const details = template === "flower"
    ? { title: "블룸 가든", description: "편지를 열면 꽃잎이 흐르는 배경 효과가 함께 보여요.", type: "flower" }
    : template === "cute"
      ? { title: "슈가 팝", description: "몽글몽글한 컬러 팝 배경 효과가 함께 보여요.", type: "cute" }
      : null;
  clearTimeout(specialPopupTimer);
  if (!details) {
    popup.classList.remove("is-visible");
    specialPopupTimer = setTimeout(() => { popup.hidden = true; }, 180);
    return;
  }
  $("#specialPopupTitle").textContent = details.title;
  $("#specialPopupDescription").textContent = details.description;
  popup.dataset.theme = details.type;
  popup.hidden = false;
  requestAnimationFrame(() => popup.classList.add("is-visible"));
  specialPopupTimer = setTimeout(() => {
    popup.classList.remove("is-visible");
    specialPopupTimer = setTimeout(() => { popup.hidden = true; }, 220);
  }, 1700);
}

function setTab(name) {
  $$(".tab").forEach((button) => {
    const active = button.dataset.tab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === name));
}

function setProgressStep(step) {
  $$("[data-progress-step]").forEach((item) => {
    const itemStep = Number(item.dataset.progressStep);
    const active = itemStep === step;
    item.classList.toggle("is-active", active);
    item.classList.toggle("is-complete", itemStep < step);
    if (active) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
}

function openModal(id) {
  const modal = $(id);
  modalReturnFocus = document.activeElement;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  modal.querySelector(".modal-close")?.focus({ preventScroll: true });
}

function closeModal(modal) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (modal.id === "linkModal") setProgressStep($("#linkResult").hidden ? 1 : 3);
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus({ preventScroll: true });
  modalReturnFocus = null;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  if (!value || !base64UrlPattern.test(value)) throw new Error("Invalid payload");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function compactLetter(letter) {
  return { v: 3, t: letter.template, r: letter.recipient, h: letter.title, b: letter.body, f: letter.sender, d: letter.date, u: letter.unlockAt, s: [letter.style.paper, letter.style.ink, letter.style.accent, letter.style.font, letter.style.size, letter.style.leading] };
}

function expandLetter(value) {
  if (!value || ![2, 3].includes(value.v) || !Array.isArray(value.s)) return value;
  return { template: value.t, recipient: value.r, title: value.h, body: value.b, sender: value.f, date: value.d, unlockAt: value.v === 3 ? value.u : null, style: { paper: value.s[0], ink: value.s[1], accent: value.s[2], font: value.s[3], size: value.s[4], leading: value.s[5] } };
}

async function gzip(bytes) {
  if (!("CompressionStream" in window)) return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  if (!("DecompressionStream" in window)) throw new Error("Compression is unsupported");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const decoded = new Uint8Array(await new Response(stream).arrayBuffer());
  if (decoded.length > maxDecodedBytes) throw new Error("Payload is too large");
  return decoded;
}

async function encodeLetter(data) {
  const safeLetter = sanitizeLetter(data, { requireContent: true });
  if (!safeLetter) return null;
  const json = JSON.stringify(compactLetter(safeLetter));
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > maxDecodedBytes) return null;
  const compressed = await gzip(bytes);
  const encoded = compressed && compressed.length < bytes.length
    ? `z.${bytesToBase64Url(compressed)}`
    : `j.${bytesToBase64Url(bytes)}`;
  return encoded.length <= maxSharedValueLength ? encoded : null;
}

async function decodeLetter(value) {
  try {
    if (typeof value !== "string" || !value || value.length > maxSharedValueLength) return null;
    const isCompressed = value.startsWith("z.");
    const isCompact = isCompressed || value.startsWith("j.");
    const payload = isCompact ? value.slice(2) : value;
    let bytes = base64UrlToBytes(payload);
    if (isCompressed) bytes = await gunzip(bytes);
    if (bytes.length > maxDecodedBytes) return null;
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return sanitizeLetter(expandLetter(parsed), { requireContent: true });
  } catch {
    return null;
  }
}

function validateLetter() {
  if (!state.recipient.trim()) { showEditorError("recipient", "받는 사람의 이름을 적어주세요."); return false; }
  if (!state.body.trim()) { showEditorError("letterBody", "편지 내용을 적어주세요."); return false; }
  if (!state.sender.trim()) { showEditorError("sender", "보내는 사람의 이름을 적어주세요."); return false; }
  $("#editorError").hidden = true;
  return true;
}

function getShareBaseUrl() {
  if (location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1") return productionShareUrl;
  const url = new URL(location.href);
  url.hash = "";
  url.search = "";
  return url.href;
}

function createShareLink() {
  if (!validateLetter()) return;
  $("#linkSetup").hidden = false;
  $("#linkResult").hidden = true;
  prepareDeliveryStep();
  setProgressStep(2);
  openModal("#linkModal");
}

function formatDeliverySummary(unlockAt) {
  return unlockAt
    ? `${new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" }).format(new Date(unlockAt))}부터 열 수 있어요.`
    : "링크를 받는 즉시 열 수 있어요.";
}

function syncResultSchedule(unlockAt) {
  const enabled = Boolean(unlockAt);
  const input = $("#resultUnlockAt");
  $("#resultScheduleEnabled").checked = enabled;
  $("#resultScheduleOptions").hidden = !enabled;
  input.min = toLocalDateTimeValue(new Date(Date.now() + 60 * 1000).toISOString());
  input.max = toLocalDateTimeValue(new Date(Date.now() + maxScheduleYears * 365 * 24 * 60 * 60 * 1000).toISOString());
  input.value = toLocalDateTimeValue(unlockAt);
  $("#linkDeliverySummary").textContent = formatDeliverySummary(unlockAt);
  $("#calendarReminder").hidden = !unlockAt;
}

async function updateGeneratedLink(unlockAt) {
  const result = $("#linkResult");
  result.setAttribute("aria-busy", "true");
  state.unlockAt = unlockAt;
  state.date = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const encoded = await encodeLetter(state);
  result.removeAttribute("aria-busy");
  if (!encoded) {
    showToast("편지 링크를 만들 수 없어요. 내용을 조금 줄여주세요.");
    return false;
  }
  $("#shareLink").value = `${getShareBaseUrl()}#letter=${encoded}`;
  $("#linkRecipient").textContent = state.recipient;
  $("#linkDeliverySummary").textContent = formatDeliverySummary(unlockAt);
  $("#calendarReminder").hidden = !unlockAt;
  saveDraft();
  return true;
}

function escapeICalendarText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function foldICalendarLine(line) {
  const chunks = [];
  let current = "";
  let byteLength = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    if (byteLength + size > 72) {
      chunks.push(current);
      current = ` ${character}`;
      byteLength = 1 + size;
    } else {
      current += character;
      byteLength += size;
    }
  }
  chunks.push(current);
  return chunks.join("\r\n");
}

function downloadCalendarReminder() {
  const unlockTime = Date.parse(state.unlockAt || "");
  const link = $("#shareLink").value;
  if (!Number.isFinite(unlockTime) || unlockTime <= Date.now() || !link) {
    return showToast("먼저 미래에 열리는 편지 링크를 만들어주세요.");
  }
  const start = new Date(unlockTime);
  const end = new Date(unlockTime + 10 * 60 * 1000);
  const toICSDate = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const eventTitle = `${state.recipient || "미래의 나"}에게 쓴 편지 열어보기`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lightframe//CSSLetter//KO",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${createLocalId()}@cssletter.local`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${escapeICalendarText(eventTitle)}`,
    `DESCRIPTION:${escapeICalendarText("오늘의 내가 남긴 편지가 열리는 날이에요. 링크를 열어 편지를 확인해보세요.")}`,
    `URL:${link}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:PT0M",
    `DESCRIPTION:${escapeICalendarText(eventTitle)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([`${lines.map(foldICalendarLine).join("\r\n")}\r\n`], { type: "text/calendar;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `cssletter-${start.toISOString().slice(0, 10)}.ics`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  showToast("캘린더 알림 파일을 받았어요. 일정 앱에 추가해 주세요.");
}

async function finalizeShareLink() {
  let safeUnlockAt = null;
  if (deliveryChoice === "later") {
    const chosen = new Date($("#shareUnlockAt").value);
    safeUnlockAt = Number.isFinite(chosen.getTime()) ? cleanUnlockAt(chosen.toISOString()) : null;
  }
  if (deliveryChoice === "later" && !safeUnlockAt) {
    $("#shareUnlockAt").focus();
    return showToast(`공개 시각은 ${maxScheduleYears}년 안으로 선택해 주세요.`);
  }
  if (safeUnlockAt && Date.parse(safeUnlockAt) <= Date.now()) {
    $("#shareUnlockAt").focus();
    return showToast("현재보다 뒤의 공개 시각을 선택해 주세요.");
  }
  if (!await updateGeneratedLink(safeUnlockAt)) return;
  syncResultSchedule(safeUnlockAt);
  $("#linkSetup").hidden = true;
  $("#linkResult").hidden = false;
  setProgressStep(3);
  $("#linkResultTitle").focus({ preventScroll: true });
}

async function toggleResultSchedule(event) {
  const enabled = event.target.checked;
  const options = $("#resultScheduleOptions");
  options.hidden = !enabled;
  if (!enabled) {
    await updateGeneratedLink(null);
    showToast("지금 바로 열리는 링크로 바꿨어요.");
    return;
  }
  const input = $("#resultUnlockAt");
  input.min = toLocalDateTimeValue(new Date(Date.now() + 60 * 1000).toISOString());
  input.max = toLocalDateTimeValue(new Date(Date.now() + maxScheduleYears * 365 * 24 * 60 * 60 * 1000).toISOString());
  const fallback = state.unlockAt && Date.parse(state.unlockAt) > Date.now()
    ? state.unlockAt
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  input.value = toLocalDateTimeValue(fallback);
  await updateGeneratedLink(fallback);
  input.focus({ preventScroll: true });
  showToast("나중에 열리는 링크로 바꿨어요.");
}

async function updateResultSchedule(event) {
  const chosen = new Date(event.target.value);
  const safeUnlockAt = Number.isFinite(chosen.getTime()) ? cleanUnlockAt(chosen.toISOString()) : null;
  if (!safeUnlockAt || Date.parse(safeUnlockAt) <= Date.now()) {
    event.target.focus();
    return showToast("현재보다 뒤의 공개 시각을 선택해 주세요.");
  }
  await updateGeneratedLink(safeUnlockAt);
  showToast("편지가 열리는 날짜를 바꿨어요.");
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

function populateReaderLetter(letter) {
  $("#introRecipient").textContent = letter.recipient || "당신";
  $("#introSender").textContent = letter.sender || "누군가";
  $("#readRecipient").textContent = letter.recipient || "당신";
  $("#readTitle").textContent = letter.title || "마음을 담은 편지";
  $("#readBody").textContent = letter.body || "";
  $("#readSender").textContent = letter.sender || "누군가";
  $("#readDate").textContent = letter.date || "";
  setPaperStyle($("#readerPaper"), letter.style || templates.cream, letter.template in templates ? letter.template : "cream");
}

function setCountdownValue(name, value, animate) {
  const roll = $(`[data-countdown="${name}"]`);
  const formatted = name === "days" ? String(value) : String(value).padStart(2, "0");
  const current = roll.children[0];
  const next = roll.children[1];
  if (roll.dataset.value === formatted) return;
  clearTimeout(Number(roll.dataset.timer));
  roll.classList.remove("is-rolling");
  current.textContent = roll.dataset.value || formatted;
  next.textContent = formatted;
  roll.dataset.value = formatted;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!animate || reduceMotion) {
    current.textContent = formatted;
    if (animate && reduceMotion && typeof roll.animate === "function") {
      roll._fadeAnimation?.cancel();
      roll._fadeAnimation = roll.animate(
        [{ opacity: 0.62 }, { opacity: 1 }],
        { duration: 150, easing: "ease-out" },
      );
    }
    return;
  }
  void roll.offsetHeight;
  roll.classList.add("is-rolling");
  roll.dataset.timer = String(setTimeout(() => {
    current.textContent = formatted;
    roll.classList.remove("is-rolling");
  }, 460));
}

function notifyLetterArrival(letter) {
  showToast("이제 편지를 열어볼 수 있어요.");
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const notification = new Notification("CSSLetter · 편지가 열렸어요", {
    body: `${letter.recipient || "당신"}님에게 도착한 편지를 지금 열어보세요.`,
    icon: "./assets/og-v4.png",
    tag: `cssletter-${letter.unlockAt || letter.date}`,
  });
  notification.onclick = () => { window.focus(); notification.close(); };
}

function revealScheduledLetter(letter) {
  clearInterval(readerCountdownTimer);
  populateReaderLetter(letter);
  $("#readerLocked").hidden = true;
  $("#readerArrival").hidden = false;
  $("#readerArrival").classList.add("has-arrived");
  notifyLetterArrival(letter);
}

function startReaderCountdown(letter) {
  const unlockTime = Date.parse(letter.unlockAt);
  const update = (animate = true) => {
    const remaining = Math.max(0, unlockTime - Date.now());
    if (remaining <= 0) return revealScheduledLetter(letter);
    const totalSeconds = Math.ceil(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    setCountdownValue("days", days, animate);
    setCountdownValue("hours", hours, animate);
    setCountdownValue("minutes", minutes, animate);
    setCountdownValue("seconds", seconds, animate);
    $("#arrivalCountdown").setAttribute("aria-label", `편지가 열리기까지 ${days}일 ${hours}시간 ${minutes}분 ${seconds}초`);
  };
  update(false);
  readerCountdownTimer = setInterval(update, 250);
}

async function enableArrivalNotification() {
  const button = $("#enableArrivalNotification");
  const note = $("#notificationNote");
  if (!("Notification" in window)) {
    button.hidden = true;
    note.textContent = "이 브라우저에서는 알림을 지원하지 않아요. 페이지의 카운터는 계속 작동해요.";
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      button.classList.add("is-enabled");
      button.querySelector("span").textContent = "알림을 준비했어요";
      note.textContent = "이 페이지를 열어 둔 동안 편지가 열리면 알려드릴게요.";
    } else {
      note.textContent = "알림이 허용되지 않았어요. 카운터가 끝나면 화면에서 바로 알려드려요.";
    }
  } catch {
    note.textContent = "알림을 켤 수 없어요. 카운터가 끝나면 화면에서 바로 알려드려요.";
  }
}

function renderReader(letter) {
  const reader = $("#readerApp");
  const readerTemplate = letter.template in templates ? letter.template : "cream";
  $("#editorApp").hidden = true;
  [...reader.classList].filter((name) => name.startsWith("reader-theme-")).forEach((name) => reader.classList.remove(name));
  reader.classList.add(`reader-theme-${readerTemplate}`);
  reader.hidden = false;
  const isLocked = letter.unlockAt && Date.parse(letter.unlockAt) > Date.now();
  $("#readerLocked").hidden = !isLocked;
  $("#readerArrival").hidden = isLocked;
  if (isLocked) {
    $("#lockedRecipient").textContent = letter.recipient || "당신";
    $("#unlockAtLabel").dateTime = letter.unlockAt;
    $("#unlockAtLabel").textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" }).format(new Date(letter.unlockAt));
    startReaderCountdown(letter);
  } else {
    populateReaderLetter(letter);
  }
  document.title = `${letter.recipient || "당신"}에게 도착한 편지 — CSSLetter`;
}

function initEditor() {
  applyState();
  $("#futureLetterStart").addEventListener("click", startFutureLetter);
  ["recipient", "letterTitle", "letterBody", "sender"].forEach((id) => {
    $(`#${id}`).addEventListener("input", (event) => {
      const key = id === "letterTitle" ? "title" : id === "letterBody" ? "body" : id;
      state[key] = event.target.value;
      event.target.removeAttribute("aria-invalid");
      $("#editorError").hidden = true;
      if (state.futureSelf && ["recipient", "sender"].includes(key)) {
        state.futureSelf = false;
        state.futureSelfBackup = null;
        const futureSelfButton = $("#futureLetterStart");
        futureSelfButton.setAttribute("aria-pressed", "false");
        futureSelfButton.setAttribute("aria-label", "미래의 나에게 쓰기");
        futureSelfButton.querySelector("span").textContent = "나에게 쓰기";
      }
      updateWritingProgress();
      saveDraft();
    });
  });

  $$(".tab").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
  $$(".paper-option").forEach((button) => button.addEventListener("click", () => {
    activeCustomPaperId = null;
    state.template = button.dataset.template;
    state.style = { ...templates[state.template] };
    applyState();
    animateLetterPaperChange();
    saveDraft();
    showSpecialPaperPopup(state.template);
  }));

  $("#specialPopupClose").addEventListener("click", () => showSpecialPaperPopup(""));

  $("#saveCustomPaper").addEventListener("click", saveCurrentPaper);
  $("#customPaperName").addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveCurrentPaper();
  });
  $("#savedPaperList").addEventListener("click", (event) => {
    const applyButton = event.target.closest("[data-custom-paper-id]");
    if (applyButton) {
      const paper = customPapers.find((item) => item.id === applyButton.dataset.customPaperId);
      if (!paper) return;
      activeCustomPaperId = paper.id;
      state.template = "custom";
      state.style = { ...paper.style };
      applyState();
      animateLetterPaperChange();
      saveDraft();
      showToast(`‘${paper.name}’ 편지지를 적용했어요.`);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-custom-paper]");
    if (!deleteButton) return;
    const paper = customPapers.find((item) => item.id === deleteButton.dataset.deleteCustomPaper);
    if (!paper || !confirm(`‘${paper.name}’ 편지지를 삭제할까요?`)) return;
    customPapers = customPapers.filter((item) => item.id !== paper.id);
    if (activeCustomPaperId === paper.id) activeCustomPaperId = null;
    try { persistCustomPapers(); } catch { return showToast("편지지 목록을 변경할 수 없어요."); }
    renderCustomPapers();
    showToast("편지지를 삭제했어요.");
  });

  const colorInputs = { paperColor: "paper", inkColor: "ink", accentColor: "accent" };
  Object.entries(colorInputs).forEach(([id, key]) => $(`#${id}`).addEventListener("input", (event) => {
    activeCustomPaperId = null;
    state.template = "custom";
    state.style[key] = event.target.value;
    $(`#${id}Value`).textContent = event.target.value.toUpperCase();
    setPaperStyle($("#letterPaper"), state.style);
    renderCustomPapers();
    saveDraft();
  }));
  $("#fontSelect").addEventListener("change", (event) => { activeCustomPaperId = null; state.template = "custom"; state.style.font = event.target.value; setPaperStyle($("#letterPaper"), state.style); renderCustomPapers(); saveDraft(); });
  $("#fontSize").addEventListener("input", (event) => { activeCustomPaperId = null; state.template = "custom"; state.style.size = Number(event.target.value); $("#fontSizeValue").textContent = state.style.size; setPaperStyle($("#letterPaper"), state.style); renderCustomPapers(); saveDraft(); });
  $("#lineHeight").addEventListener("input", (event) => { activeCustomPaperId = null; state.template = "custom"; state.style.leading = Number(event.target.value); $("#lineHeightValue").textContent = state.style.leading; setPaperStyle($("#letterPaper"), state.style); renderCustomPapers(); saveDraft(); });

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
  $$('[data-delivery-choice]').forEach((button) => button.addEventListener("click", () => setDeliveryChoice(button.dataset.deliveryChoice)));
  $("#finalizeShareLink").addEventListener("click", finalizeShareLink);
  $$('[data-schedule-preset]').forEach((button) => button.addEventListener("click", () => setSchedulePreset(button.dataset.schedulePreset)));
  $("#shareUnlockAt").addEventListener("input", () => {
    $$('[data-schedule-preset]').forEach((button) => {
      button.classList.remove("is-selected");
      button.setAttribute("aria-pressed", "false");
    });
  });
  $("#resultScheduleEnabled").addEventListener("change", toggleResultSchedule);
  $("#resultUnlockAt").addEventListener("change", updateResultSchedule);
  $("#downloadCalendarReminder").addEventListener("click", downloadCalendarReminder);
  $("#copyLink").addEventListener("click", async () => {
    const link = $("#shareLink").value;
    try { await navigator.clipboard.writeText(link); } catch { $("#shareLink").select(); document.execCommand("copy"); }
    $("#copyLink span").textContent = "복사됨";
    showToast("읽기 링크를 복사했어요.");
    setTimeout(() => { $("#copyLink span").textContent = "복사"; }, 1800);
  });
  $("#shareNative").addEventListener("click", async () => {
    const link = $("#shareLink").value;
    if (navigator.share) {
      try {
        await navigator.share({ title: "CSSLetter", text: `${state.recipient}님에게 보내는 편지`, url: link });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    try { await navigator.clipboard.writeText(link); } catch { $("#shareLink").select(); document.execCommand("copy"); }
    showToast("공유 링크를 복사했어요.");
  });
  $("#openSharedLetter").addEventListener("click", () => {
    try {
      const target = new URL($("#shareLink").value, location.href);
      const production = new URL(productionShareUrl);
      const isCurrentPage = target.origin === location.origin && target.pathname === location.pathname;
      const isProductionPage = target.origin === production.origin && target.pathname === production.pathname;
      if ((!isCurrentPage && !isProductionPage) || !target.hash.startsWith("#letter=")) throw new Error("Invalid share URL");
      const opened = window.open(target.href, "_blank");
      if (opened) opened.opener = null;
      else location.assign(target.href);
    } catch {
      showToast("안전한 CSSLetter 링크가 아니에요.");
    }
  });
}

function initCommon() {
  $$('[data-close-modal]').forEach((element) => element.addEventListener("click", () => closeModal(element.closest(".modal"))));
  $("#enableArrivalNotification").addEventListener("click", enableArrivalNotification);
  document.addEventListener("keydown", (event) => {
    const openDialog = $(".modal.is-open .modal-card");
    if (event.key === "Escape") $$(".modal.is-open").forEach(closeModal);
    if (event.key === "Tab" && openDialog) {
      const focusable = $$('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), [tabindex="0"]', openDialog)
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first && last && event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (first && last && !event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !$("#editorApp").hidden && !$(".modal.is-open")) createShareLink();
  });
  window.lucide?.createIcons();
}

async function bootstrap() {
  const sharedValue = location.hash.startsWith("#letter=") ? location.hash.slice(8) : "";
  const sharedLetter = sharedValue ? await decodeLetter(sharedValue) : null;

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
}

bootstrap();
