import { completedLines, makeBoard, updateCell, validBoard } from "./bingo-model.js";

const api = document.querySelector('meta[name="bingo-api"]')?.content.replace(/\/$/, "") ?? "";
const storageKey = "tool:bingo-v1";
const $ = (id) => document.getElementById(id);
const workspace = $("bingoWorkspace");
const grid = $("bingoGrid");
const editor = $("cellEditor");
const setup = $("boardSetup");
const setupForm = $("setupForm");
const share = $("shareBoard");
const status = $("bingoStatus");
const roomPattern = /^[a-f0-9]{48}$/;
const requestedRoom = new URLSearchParams(location.hash.slice(1)).get("room");
let room = "";
let board = null;
let editorRows = [];
let tileElements = [];
let queue = Promise.resolve();
let pending = 0;
let connecting = false;
let polling = false;

function storedBoard() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return validBoard(saved) ? saved : null;
  } catch {
    return null;
  }
}

function saveLocalBoard() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(board));
    status.textContent = "이 브라우저에 저장됨";
  } catch {
    status.textContent = "이 브라우저에 저장할 수 없습니다.";
  }
}

function setRoom(token) {
  room = token;
  const url = new URL(location.href);
  url.hash = token ? new URLSearchParams({ room: token }).toString() : "";
  history.replaceState(null, "", url);
}

async function request(path, method = "GET", payload) {
  const response = await fetch(api + path, {
    method,
    cache: "no-store",
    headers: {
      ...(room ? { Authorization: `Bearer ${room}` } : {}),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`빙고 서버 ${response.status}`);
  return response.json();
}

function draw() {
  const lines = completedLines(board);
  const highlighted = new Set(lines.flat());
  $("completedLines").textContent = `${lines.length}줄 빙고`;
  board.cells.forEach((cell, index) => {
    const tile = tileElements[index];
    const row = editorRows[index];
    tile.label.textContent = cell.label || "—";
    tile.mission.hidden = !cell.mission;
    tile.stamp.hidden = !cell.done;
    tile.button.classList.toggle("bingo-cell--empty", !cell.label);
    tile.button.classList.toggle("bingo-cell--mission", !!cell.mission);
    tile.button.classList.toggle("bingo-cell--line", highlighted.has(index));
    const description = [
      `${index + 1}번 칸`, cell.label || "미입력", cell.mission,
      cell.done && "성공", highlighted.has(index) && "빙고 완성",
    ].filter(Boolean).join(" · ");
    tile.button.title = description;
    tile.button.setAttribute("aria-label", description);
    if (document.activeElement !== row.label) row.label.value = cell.label;
    if (document.activeElement !== row.mission) row.mission.value = cell.mission;
    row.done.disabled = !cell.label.trim();
    row.done.setAttribute("aria-pressed", String(cell.done));
    row.done.textContent = cell.done ? "성공 취소" : "성공";
  });
}

function mount(next) {
  board = next;
  workspace.hidden = false;
  share.hidden = !api;
  grid.style.setProperty("--bingo-columns", board.columns);
  grid.style.setProperty("--bingo-rows", board.rows);
  grid.replaceChildren();
  editor.replaceChildren();
  editorRows = [];
  tileElements = [];

  board.cells.forEach((_, index) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "bingo-cell";
    const label = document.createElement("span");
    label.className = "bingo-cell__label";
    const mission = document.createElement("span");
    mission.className = "bingo-cell__mission";
    mission.setAttribute("aria-hidden", "true");
    const stamp = document.createElement("span");
    stamp.className = "bingo-cell__stamp";
    stamp.textContent = "성공";
    stamp.setAttribute("aria-hidden", "true");
    tile.append(label, mission, stamp);
    grid.append(tile);
    tileElements.push({ button: tile, label, mission, stamp });

    const row = document.createElement("div");
    row.className = "bingo-editor-row";
    const number = document.createElement("span");
    number.textContent = String(index + 1);
    row.append(number);
    function addField(field, title, maxLength) {
      const wrapper = document.createElement("label");
      wrapper.textContent = title;
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = maxLength;
      input.required = field === "label";
      input.setAttribute("aria-label", `${index + 1}번 칸 ${title}`);
      input.addEventListener("change", () => applyEdit({ index, field, value: input.value }));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.isComposing) input.blur();
      });
      wrapper.append(input);
      row.append(wrapper);
      return input;
    }
    const labelInput = addField("label", "숫자·글자 (필수)", 20);
    const missionInput = addField("mission", "미션 (선택)", 180);
    const done = document.createElement("button");
    done.type = "button";
    done.className = "bingo-button";
    labelInput.addEventListener("input", () => { done.disabled = !labelInput.value.trim(); });
    done.addEventListener("click", () => applyEdit({ index, field: "done", value: !board.cells[index].done }));
    row.append(done);
    editor.append(row);
    editorRows.push({ label: labelInput, mission: missionInput, done });
    tile.addEventListener("click", () => labelInput.focus());
  });
  draw();
}

function applyEdit(patch) {
  if (!room) {
    if (updateCell(board, patch)) {
      saveLocalBoard();
      draw();
    }
    return;
  }
  const targetRoom = room;
  pending += 1;
  queue = queue.then(async () => {
    if (room !== targetRoom) return;
    const next = await request("/room", "PATCH", patch);
    if (room === targetRoom && validBoard(next)) {
      board = next;
      draw();
      status.textContent = "공유 중 · 변경사항 저장됨";
    }
  }).catch(() => {
    if (room === targetRoom) {
      draw();
      status.textContent = "변경사항을 저장하지 못했습니다. 해당 칸을 다시 입력해 주세요.";
    }
  }).finally(() => { pending -= 1; });
}

async function sync() {
  if (!room || !board || pending || polling || document.hidden) return;
  const targetRoom = room;
  polling = true;
  try {
    const next = await request("/room");
    if (room === targetRoom && !pending && validBoard(next) && next.revision > board.revision) {
      board = next;
      draw();
    }
  } catch {
    // The next visible polling cycle retries a temporary connection failure.
  } finally {
    polling = false;
  }
}

function openSetup() {
  $("cancelSetup").hidden = !board;
  if (board && board.rows === board.columns && board.rows >= 4) {
    $("boardSize").value = String(board.rows);
  }
  setup.showModal();
}

$("newBoard").addEventListener("click", () => {
  if (connecting || pending) return;
  if (board && !room && board.cells.some((cell) => cell.label || cell.mission) &&
      !confirm("현재 빙고판을 새 판으로 바꿀까요?")) return;
  openSetup();
});
$("cancelSetup").addEventListener("click", () => setup.close());
setup.addEventListener("cancel", (event) => { if (!board) event.preventDefault(); });
setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const size = Number($("boardSize").value);
  if (!Number.isInteger(size) || size < 4 || size > 8) return;
  setRoom("");
  mount(makeBoard(size, size));
  saveLocalBoard();
  setup.close();
});

share.addEventListener("click", async () => {
  if (!api || !board || connecting || pending) return;
  connecting = true;
  share.disabled = true;
  workspace.inert = true;
  try {
    if (!room) {
      const { token } = await request("/rooms", "POST", board);
      if (!roomPattern.test(token)) throw new Error("Invalid room token");
      setRoom(token);
      board.revision = 0;
    }
    try {
      await navigator.clipboard.writeText(location.href);
      status.textContent = "공유 링크를 복사했습니다. 링크를 받은 사람은 함께 편집할 수 있습니다.";
    } catch {
      status.textContent = "공유 방이 열렸습니다. 주소창의 링크를 복사해 주세요.";
    }
  } catch {
    status.textContent = "공유 방을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  } finally {
    workspace.inert = false;
    connecting = false;
    share.disabled = false;
  }
});

if (requestedRoom) {
  connecting = true;
  status.textContent = "공유 빙고판을 여는 중…";
  try {
    if (!api || !roomPattern.test(requestedRoom)) throw new Error("Invalid room");
    room = requestedRoom;
    const next = await request("/room");
    if (!validBoard(next)) throw new Error("Invalid board");
    mount(next);
    status.textContent = "공유 중 · 이 링크를 가진 사람이 함께 편집할 수 있습니다.";
  } catch {
    room = "";
    status.textContent = "공유 빙고판을 열 수 없습니다. 링크를 확인하거나 새 판을 만들어 주세요.";
  } finally {
    connecting = false;
  }
} else {
  const saved = storedBoard();
  if (saved) {
    mount(saved);
    status.textContent = "이 브라우저에 저장됨";
  } else {
    openSetup();
  }
}
if (api) setInterval(sync, 2500);
