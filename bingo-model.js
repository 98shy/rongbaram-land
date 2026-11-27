export function validDimensions(rows, columns) {
  return [rows, columns].every((n) => Number.isInteger(n) && n >= 2 && n <= 8);
}

export function makeBoard(rows, columns) {
  return {
    rows, columns, revision: 0,
    cells: Array.from({ length: rows * columns }, () => ({ label: "", mission: "", done: false })),
  };
}

export function validBoard(board) {
  return Boolean(board && validDimensions(board.rows, board.columns) &&
    Number.isSafeInteger(board.revision) && board.revision >= 0 &&
    Array.isArray(board.cells) && board.cells.length === board.rows * board.columns &&
    board.cells.every((cell) => cell && typeof cell.label === "string" && cell.label.length <= 20 &&
      typeof cell.mission === "string" && cell.mission.length <= 180 &&
      typeof cell.done === "boolean" && (!cell.done || !!cell.label.trim())));
}

export function updateCell(board, { index, field, value }) {
  if (!Number.isInteger(index) || index < 0 || index >= board.cells.length) return false;
  const cell = board.cells[index];
  if (field === "done" && typeof value === "boolean" && (!value || cell.label.trim())) {
    cell.done = value;
  } else if (field === "label" && typeof value === "string" && value.length <= 20) {
    cell.label = value.trim();
    if (!cell.label) cell.done = false;
  } else if (field === "mission" && typeof value === "string" && value.length <= 180) {
    cell.mission = value.trim();
  } else {
    return false;
  }
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
