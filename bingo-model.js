export function validDimensions(rows, columns) {
  return [rows, columns].every((n) => Number.isInteger(n) && n >= 2 && n <= 8);
}

export function makeBoard(rows, columns) {
  return {
    rows, columns, revision: 0,
    cells: Array.from({ length: rows * columns }, () => ({
      label: "", mission: "", missionName: "", missionBalloons: "", done: false, missionDone: false,
    })),
  };
}

export function hasMission(cell) {
  return Boolean(cell.mission.trim() || cell.missionName?.trim() || cell.missionBalloons);
}

const validBalloons = (value) => typeof value === "string" && /^\d{0,9}$/.test(value);
export const MAX_BALLOONS = 999_999_999;

export function validBoard(board) {
  return Boolean(board && validDimensions(board.rows, board.columns) &&
    Number.isSafeInteger(board.revision) && board.revision >= 0 &&
    Array.isArray(board.cells) && board.cells.length === board.rows * board.columns &&
    board.cells.every((cell) => cell && typeof cell.label === "string" && cell.label.length <= 20 &&
      typeof cell.mission === "string" && cell.mission.length <= 180 &&
      (cell.missionName === undefined || (typeof cell.missionName === "string" && cell.missionName.length <= 40)) &&
      (cell.missionBalloons === undefined || validBalloons(cell.missionBalloons)) &&
      typeof cell.done === "boolean" && (!cell.done || !!cell.label.trim()) &&
      (cell.missionDone === undefined || typeof cell.missionDone === "boolean") &&
      (!cell.missionDone || hasMission(cell))));
}

export function updateCell(board, { index, field, value }) {
  if (field === "resetDone" && value === true) {
    if (board.cells.some((cell) => cell.done)) {
      for (const cell of board.cells) cell.done = false;
      board.revision += 1;
    }
    return true;
  }
  if (!Number.isInteger(index) || index < 0 || index >= board.cells.length) return false;
  const cell = board.cells[index];
  if (field === "done" && typeof value === "boolean" && (!value || cell.label.trim())) {
    cell.done = value;
  } else if (field === "missionDone" && typeof value === "boolean" && (!value || hasMission(cell))) {
    cell.missionDone = value;
  } else if (field === "label" && typeof value === "string" && value.length <= 20) {
    cell.label = value.trim();
    if (!cell.label) cell.done = false;
  } else if (field === "mission" && typeof value === "string" && value.length <= 180) {
    cell.mission = value.trim();
  } else if (field === "missionName" && typeof value === "string" && value.length <= 40) {
    cell.missionName = value.trim();
  } else if (field === "missionBalloons" && validBalloons(value)) {
    cell.missionBalloons = value === "" ? "" : String(Number(value));
  } else if (field === "missionBalloonsDelta" && (value === 100 || value === -100)) {
    const count = Math.min(MAX_BALLOONS, Math.max(0, Number(cell.missionBalloons || 0) + value));
    cell.missionBalloons = count ? String(count) : "";
  } else {
    return false;
  }
  if (!hasMission(cell)) cell.missionDone = false;
  board.revision += 1;
  return true;
}

export function completedLines(board) {
  const { rows, columns, cells } = board;
  const numbers = (length) => Array.from({ length }, (_, index) => index);
  const paths = [
    ...numbers(rows).map((r) => numbers(columns).map((c) => r * columns + c)),
    ...numbers(columns).map((c) => numbers(rows).map((r) => r * columns + c)),
  ];
  if (rows === columns) {
    paths.push(numbers(rows).map((i) => i * columns + i));
    paths.push(numbers(rows).map((i) => i * columns + columns - 1 - i));
  }
  return paths.filter((path) => path.every((index) => cells[index].done && cells[index].label.trim()));
}
