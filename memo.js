const MEMO_STORAGE_KEY = "rongbaram-land:memo-v1";
const MEMO_PREFERENCES_KEY = "rongbaram-land:memo-preferences-v1";
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 48;
const DEFAULT_FONT_SIZE = 16;
const FONT_FAMILIES = {
  "noto-sans": '"Noto Sans KR", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif',
  "nanum-gothic": '"Nanum Gothic", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif',
  "nanum-myeongjo": '"Nanum Myeongjo", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", serif',
  "gowun-dodum": '"Gowun Dodum", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif',
  jua: '"Jua", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif',
  "do-hyeon": '"Do Hyeon", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif',
  "gamja-flower": '"Gamja Flower", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", cursive',
  gaegu: '"Gaegu", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", cursive',
  "hi-melody": '"Hi Melody", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", cursive',
  "nanum-pen": '"Nanum Pen Script", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", cursive',
  "poor-story": '"Poor Story", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", cursive',
  dongle: '"Dongle", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif',
  "single-day": '"Single Day", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", cursive',
  "yeon-sung": '"Yeon Sung", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", cursive',
  stylish: '"Stylish", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", cursive',
  "black-han-sans": '"Black Han Sans", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif',
  "song-myung": '"Song Myung", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", serif',
  "gowun-batang": '"Gowun Batang", "Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", serif',
};

const memoEditor = document.querySelector("#memoEditor");
const memoSaveStatus = document.querySelector("#memoSaveStatus");
const memoCharacterCount = document.querySelector("#memoCharacterCount");
const memoClearButton = document.querySelector("#memoClearButton");
const memoFontFamily = document.querySelector("#memoFontFamily");
const memoFontSmaller = document.querySelector("#memoFontSmaller");
const memoFontLarger = document.querySelector("#memoFontLarger");
const memoFontSize = document.querySelector("#memoFontSize");
const memoSymbolToggle = document.querySelector("#memoSymbolToggle");
const memoSymbolPalette = document.querySelector("#memoSymbolPalette");

let preferences = readPreferences();

function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(MEMO_PREFERENCES_KEY));
    const fontFamily = FONT_FAMILIES[saved?.fontFamily] ? saved.fontFamily : "noto-sans";
    const parsedSize = Number.parseInt(saved?.fontSize, 10);
    const fontSize = Number.isFinite(parsedSize)
      ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, parsedSize))
      : DEFAULT_FONT_SIZE;
    return { fontFamily, fontSize };
  } catch {
    return { fontFamily: "noto-sans", fontSize: DEFAULT_FONT_SIZE };
  }
}

function savePreferences() {
  try {
    localStorage.setItem(MEMO_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    memoSaveStatus.textContent = "설정을 저장하지 못함";
    memoSaveStatus.classList.add("is-error");
  }
}

function applyPreferences() {
  const lineHeight = Math.max(32, Math.round(preferences.fontSize * 1.7));
  memoEditor.style.setProperty("--memo-font-family", FONT_FAMILIES[preferences.fontFamily]);
  memoEditor.style.setProperty("--memo-font-size", `${preferences.fontSize}px`);
  memoEditor.style.setProperty("--memo-line-height", `${lineHeight}px`);
  memoFontFamily.value = preferences.fontFamily;
  memoFontSize.value = preferences.fontSize;
  memoFontSmaller.disabled = preferences.fontSize <= MIN_FONT_SIZE;
  memoFontLarger.disabled = preferences.fontSize >= MAX_FONT_SIZE;
}

function updateFontSize(delta) {
  preferences.fontSize = Math.min(
    MAX_FONT_SIZE,
    Math.max(MIN_FONT_SIZE, preferences.fontSize + delta)
  );
  applyPreferences();
  savePreferences();
}

function updateCharacterCount() {
  memoCharacterCount.textContent = `${memoEditor.value.length.toLocaleString("ko-KR")}자`;
}

function loadMemo() {
  try {
    memoEditor.value = localStorage.getItem(MEMO_STORAGE_KEY) ?? "";
  } catch {
    memoSaveStatus.textContent = "저장소를 사용할 수 없음";
    memoSaveStatus.classList.add("is-error");
  }
  updateCharacterCount();
}

function saveMemo() {
  try {
    localStorage.setItem(MEMO_STORAGE_KEY, memoEditor.value);
    memoSaveStatus.textContent = "자동 저장됨";
    memoSaveStatus.classList.remove("is-error");
  } catch {
    memoSaveStatus.textContent = "저장하지 못함";
    memoSaveStatus.classList.add("is-error");
  }
  updateCharacterCount();
}

memoEditor.addEventListener("input", saveMemo);

memoEditor.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || event.shiftKey) return;
  event.preventDefault();
  const cursorPosition = memoEditor.selectionStart;
  memoEditor.setRangeText("    ", cursorPosition, cursorPosition, "end");
  saveMemo();
});

memoFontFamily.addEventListener("change", () => {
  preferences.fontFamily = memoFontFamily.value;
  applyPreferences();
  savePreferences();
});

memoFontSmaller.addEventListener("click", () => updateFontSize(-1));
memoFontLarger.addEventListener("click", () => updateFontSize(1));

memoFontSize.addEventListener("input", () => {
  const fontSize = Number.parseInt(memoFontSize.value, 10);
  if (!Number.isFinite(fontSize) || fontSize < MIN_FONT_SIZE || fontSize > MAX_FONT_SIZE) return;
  preferences.fontSize = fontSize;
  applyPreferences();
  savePreferences();
});

memoFontSize.addEventListener("change", () => {
  const typedSize = Number.parseInt(memoFontSize.value, 10);
  if (!Number.isFinite(typedSize)) {
    applyPreferences();
    return;
  }
  preferences.fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, typedSize));
  applyPreferences();
  savePreferences();
});

memoFontSize.addEventListener("keydown", (event) => {
  if (event.key === "Enter") memoFontSize.blur();
});

memoSymbolToggle.addEventListener("click", () => {
  const willOpen = memoSymbolPalette.hidden;
  memoSymbolPalette.hidden = !willOpen;
  memoSymbolToggle.setAttribute("aria-expanded", String(willOpen));
});

memoSymbolPalette.addEventListener("click", (event) => {
  const button = event.target.closest("[data-symbol]");
  if (!button) return;
  const start = memoEditor.selectionStart;
  const end = memoEditor.selectionEnd;
  memoEditor.setRangeText(button.dataset.symbol, start, end, "end");
  saveMemo();
  memoEditor.focus();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || memoSymbolPalette.hidden) return;
  memoSymbolPalette.hidden = true;
  memoSymbolToggle.setAttribute("aria-expanded", "false");
  memoSymbolToggle.focus();
});

memoClearButton.addEventListener("click", () => {
  if (!memoEditor.value) return;
  if (!window.confirm("작성한 메모를 모두 삭제할까요?")) return;
  memoEditor.value = "";
  saveMemo();
  memoEditor.focus();
});

applyPreferences();
loadMemo();
