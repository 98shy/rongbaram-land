import { completedLines, hasMission, makeBoard, MAX_BALLOONS, updateCell, validBoard } from "./bingo-model.js?v=4";

const api = document.querySelector('meta[name="bingo-api"]')?.content.replace(/\/$/, "") ?? "";
const storageKey = "tool:bingo-v1";
const $ = (id) => document.getElementById(id);
const workspace = $("bingoWorkspace");
const grid = $("bingoGrid");
const lineLayer = document.createElement("div");
lineLayer.className = "bingo-line-layer";
lineLayer.setAttribute("aria-hidden", "true");
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

function drawLines(lines) {
  const bounds = grid.getBoundingClientRect();
  const strokes = lines.map((path) => {
    const first = tileElements[path[0]].button.getBoundingClientRect();
    const last = tileElements[path.at(-1)].button.getBoundingClientRect();
    const dx = last.x + last.width / 2 - first.x - first.width / 2;
    const dy = last.y + last.height / 2 - first.y - first.height / 2;
    const stroke = document.createElement("span");
    stroke.className = "bingo-line";
    stroke.style.left = `${first.x - bounds.x + first.width / 2}px`;
    stroke.style.top = `${first.y - bounds.y + first.height / 2}px`;
    stroke.style.width = `${Math.hypot(dx, dy)}px`;
    stroke.style.rotate = `${Math.atan2(dy, dx)}rad`;
    return stroke;
  });
  lineLayer.replaceChildren(...strokes);
}

new ResizeObserver(() => {
  if (board) drawLines(completedLines(board));
}).observe(grid);

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
  $("completedCells").textContent = `칸 성공 ${board.cells.filter((cell) => cell.done).length}/${board.cells.length}`;
  $("completedMissions").textContent = `미션 성공 ${board.cells.filter((cell) => cell.missionDone).length}/${board.cells.filter(hasMission).length}`;
  board.cells.forEach((cell, index) => {
    const tile = tileElements[index];
    const row = editorRows[index];
    tile.label.textContent = cell.label || "—";
    const labelLength = [...cell.label].length;
    tile.label.style.setProperty("--label-scale", String(Math.max(23, Math.min(56, 110 / Math.max(1, labelLength)))));
    const missionExists = hasMission(cell);
    tile.mission.hidden = !missionExists;
    tile.mission.textContent = cell.missionDone ? "성공" : "미션";
    tile.stamp.hidden = !cell.done;
    tile.button.classList.toggle("bingo-cell--empty", !cell.label);
    tile.button.classList.toggle("bingo-cell--mission", missionExists);
    tile.button.classList.toggle("bingo-cell--mission-done", !!cell.missionDone);
    tile.button.classList.toggle("bingo-cell--line", highlighted.has(index));
    const description = [
      `${index + 1}번 칸`, cell.label || "미입력", cell.missionName,
      cell.missionBalloons && `별풍선 ${Number(cell.missionBalloons).toLocaleString("ko-KR")}개`, cell.mission,
      cell.done && "칸 성공", cell.missionDone && "미션 성공", highlighted.has(index) && "빙고 완성",
    ].filter(Boolean).join(" · ");
    tile.button.title = description;
    tile.button.setAttribute("aria-label", description);
    for (const [field, input] of Object.entries(row.inputs)) {
      if (document.activeElement !== input) input.value = cell[field] ?? "";
    }
    const balloons = Number(cell.missionBalloons || 0);
    row.balloons.output.textContent = `${balloons.toLocaleString("ko-KR")}개`;
    row.balloons.minus.disabled = balloons === 0;
    row.balloons.plus.disabled = balloons > MAX_BALLOONS - 100;
    row.done.disabled = !cell.label.trim();
    row.done.setAttribute("aria-pressed", String(cell.done));
    row.missionDone.disabled = !missionExists;
    row.missionDone.setAttribute("aria-pressed", String(!!cell.missionDone));
  });
  drawLines(lines);
}

function mount(next) {
  board = next;
  workspace.hidden = false;
  share.hidden = !api;
  grid.style.setProperty("--bingo-columns", board.columns);
  grid.style.setProperty("--bingo-rows", board.rows);
  grid.replaceChildren(lineLayer);
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
    mission.className = "bingo-cell__stamp bingo-cell__mission";
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
    const inputs = {};
    function addField(parent, field, title, maxLength) {
      const wrapper = document.createElement("label");
      wrapper.dataset.field = field;
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
      parent.append(wrapper);
      inputs[field] = input;
      return input;
    }
    const labelInput = addField(row, "label", "숫자·글자 (필수)", 20);
    function addSuccess(parent, field, title, relatedInputs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `bingo-button bingo-button--${field}`;
      button.textContent = title;
      button.setAttribute("aria-label", `${index + 1}번 칸 ${title}`);
      for (const input of relatedInputs) {
        input.addEventListener("input", () => {
          button.disabled = !relatedInputs.some((item) => item.value.trim()) &&
            !(field === "missionDone" && Number(board.cells[index].missionBalloons));
        });
      }
      button.addEventListener("click", () => applyEdit({ index, field, value: !board.cells[index][field] }));
      parent.append(button);
      return button;
    }
    const done = addSuccess(row, "done", "칸 성공", [labelInput]);
    const missionGroup = document.createElement("fieldset");
    missionGroup.className = "bingo-mission-group";
    const legend = document.createElement("legend");
    legend.textContent = "미션";
    missionGroup.append(legend);
    const missionNameInput = addField(missionGroup, "missionName", "닉네임", 40);

    const balloonField = document.createElement("div");
    balloonField.className = "bingo-balloon-field";
    balloonField.textContent = "별풍선 개수";
    const balloonControls = document.createElement("div");
    balloonControls.className = "bingo-balloon-controls";
    balloonControls.setAttribute("role", "group");
    balloonControls.setAttribute("aria-label", `${index + 1}번 칸 미션 별풍선 개수`);
    const balloonOutput = document.createElement("output");
    function balloonButton(delta) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bingo-button";
      button.textContent = delta > 0 ? "+100" : "−100";
      button.setAttribute("aria-label", `별풍선 100개 ${delta > 0 ? "올리기" : "내리기"}`);
      button.addEventListener("click", () => applyEdit({ index, field: "missionBalloonsDelta", value: delta }));
      return button;
    }
    const minus = balloonButton(-100);
    const plus = balloonButton(100);
    balloonControls.append(minus, balloonOutput, plus);
    balloonField.append(balloonControls);
    missionGroup.append(balloonField);

    const missionInput = addField(missionGroup, "mission", "내용", 180);
    const missionDone = addSuccess(missionGroup, "missionDone", "미션 성공", [missionNameInput, missionInput]);
    row.append(missionGroup);
    editor.append(row);
    editorRows.push({ inputs, done, missionDone, balloons: { output: balloonOutput, minus, plus } });
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
  if (board && !room && board.cells.some((cell) => cell.label || hasMission(cell)) &&
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
