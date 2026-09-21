const MEMO_STORAGE_KEY = "rongbaram-land:memo-v1";

const memoEditor = document.querySelector("#memoEditor");
const memoSaveStatus = document.querySelector("#memoSaveStatus");
const memoCharacterCount = document.querySelector("#memoCharacterCount");
const memoClearButton = document.querySelector("#memoClearButton");

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

memoClearButton.addEventListener("click", () => {
  if (!memoEditor.value) return;
  if (!window.confirm("작성한 메모를 모두 삭제할까요?")) return;
  memoEditor.value = "";
  saveMemo();
  memoEditor.focus();
});

loadMemo();
