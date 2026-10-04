const LAND_RECORDS_STORAGE_KEY = "lol-champion-tracker:land-records-v1";
const MIXER_STORAGE_KEY = "rongbaram-land:team-mixer-v1";
const PAIR_COUNT = 5;
const SUHIT_ALIASES = new Set(["수힛", "수히"]);

const ui = {
  pairs: document.querySelector("#mixerPairs"),
  resultList: document.querySelector("#mixerResultList"),
  empty: document.querySelector("#mixerEmpty"),
  shuffle: document.querySelector("#mixerShuffleButton"),
  copy: document.querySelector("#mixerCopyButton"),
  reset: document.querySelector("#mixerResetButton"),
  close: document.querySelector("#mixerCloseButton"),
  status: document.querySelector("#mixerStatus"),
};

let state = readMixerState();

function normalizeName(value) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function canonicalParticipant(value) {
  const normalized = normalizeName(value);
  return SUHIT_ALIASES.has(normalized) ? "__suhit__" : normalized;
}

function isSuhit(value) {
  return SUHIT_ALIASES.has(normalizeName(value));
}

function emptyPairs() {
  return Array.from({ length: PAIR_COUNT }, () => ["", ""]);
}

function readMixerState() {
  const fallback = { pairs: emptyPairs(), result: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(MIXER_STORAGE_KEY));
    if (!saved || !Array.isArray(saved.pairs)) return fallback;
    const pairs = emptyPairs().map((pair, index) => {
      const savedPair = saved.pairs[index];
      if (!Array.isArray(savedPair)) return pair;
      return [String(savedPair[0] ?? ""), String(savedPair[1] ?? "")];
    });
    const result = Array.isArray(saved.result)
      ? saved.result.slice(0, PAIR_COUNT).map((pair) => [String(pair?.[0] ?? ""), String(pair?.[1] ?? "")])
      : [];
    return { pairs, result: result.length === PAIR_COUNT ? result : [] };
  } catch {
    return fallback;
  }
}

function saveMixerState() {
  try {
    localStorage.setItem(MIXER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    setStatus("브라우저 저장 공간을 확인해 주세요.", true);
  }
}

function readLandRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(LAND_RECORDS_STORAGE_KEY));
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function recordBalance(record) {
  if (typeof record?.balance === "string") return record.balance;
  return typeof record?.opponent === "string" ? record.opponent : "";
}

function opponentStats(opponent) {
  const target = normalizeName(opponent);
  if (!target) return null;
  const matched = readLandRecords().filter((record) => normalizeName(recordBalance(record)) === target);
  if (!matched.length) return null;
  return matched.reduce((stats, record) => {
    const wins = Math.max(0, Number.parseInt(record.wins, 10) || 0);
    const losses = Math.max(0, Number.parseInt(record.losses, 10) || 0);
    const stake = Math.max(0, Number.parseInt(record.stake, 10) || 0);
    const storedSettlement = Number(record.settlement);
    stats.wins += wins;
    stats.losses += losses;
    stats.settlement += Number.isFinite(storedSettlement) ? storedSettlement : (wins - losses) * stake;
    return stats;
  }, { wins: 0, losses: 0, settlement: 0 });
}

function formatSettlement(value) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("ko-KR")}개`;
}

function setStatus(message, isError = false) {
  ui.status.textContent = message;
  ui.status.classList.toggle("is-error", isError);
}

function createPairInputs() {
  const fragment = document.createDocumentFragment();
  state.pairs.forEach((pair, pairIndex) => {
    const row = document.createElement("div");
    row.className = "mixer-pair";

    const label = document.createElement("strong");
    label.textContent = `밸런스 ${pairIndex + 1}`;

    const versus = document.createElement("span");
    versus.className = "mixer-pair__versus";
    versus.textContent = "VS";

    const inputs = pair.map((value, participantIndex) => {
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 24;
      input.autocomplete = "off";
      input.placeholder = `이름 ${pairIndex * 2 + participantIndex + 1}`;
      input.value = value;
      input.dataset.pair = String(pairIndex);
      input.dataset.participant = String(participantIndex);
      input.setAttribute("aria-label", `밸런스 ${pairIndex + 1} 참가자 ${participantIndex + 1}`);
      return input;
    });

    row.append(label, inputs[0], versus, inputs[1]);
    fragment.append(row);
  });
  ui.pairs.replaceChildren(fragment);
}

function createPlayer(name, team, highlighted) {
  const player = document.createElement("strong");
  player.className = `mixer-player mixer-player--${team}`;
  if (highlighted) player.classList.add("is-suhit");
  player.textContent = name;
  return player;
}

function createHistoryNote(left, right) {
  const suhitSide = isSuhit(left) ? "a" : isSuhit(right) ? "b" : "";
  if (!suhitSide) return null;
  const opponent = suhitSide === "a" ? right : left;
  const stats = opponentStats(opponent);
  const note = document.createElement("div");
  note.className = `mixer-history mixer-history--${suhitSide}`;
  const teamName = suhitSide === "a" ? "A팀" : "B팀";
  if (!stats) {
    note.textContent = `${teamName} 수힛 기준 · ${opponent} 상대 저장 전적 없음`;
    return note;
  }
  const settlementClass = stats.settlement > 0 ? "is-positive" : stats.settlement < 0 ? "is-negative" : "";
  const prefix = document.createElement("span");
  prefix.textContent = `${teamName} 수힛 기준 · ${opponent} 상대 `;
  const score = document.createElement("strong");
  score.textContent = `${stats.wins}승 ${stats.losses}패`;
  const settlement = document.createElement("strong");
  settlement.className = settlementClass;
  settlement.textContent = formatSettlement(stats.settlement);
  note.append(prefix, score, document.createTextNode(" · "), settlement);
  return note;
}

function renderResult() {
  const hasResult = state.result.length === PAIR_COUNT;
  ui.empty.hidden = hasResult;
  ui.copy.disabled = !hasResult;
  if (!hasResult) {
    ui.resultList.replaceChildren();
    return;
  }

  const fragment = document.createDocumentFragment();
  state.result.forEach(([left, right], index) => {
    const row = document.createElement("div");
    row.className = "mixer-result__row";
    const number = document.createElement("span");
    number.className = "mixer-result__number";
    number.textContent = String(index + 1).padStart(2, "0");
    const matchup = document.createElement("div");
    matchup.className = "mixer-result__matchup";
    const versus = document.createElement("span");
    versus.className = "mixer-result__versus";
    versus.textContent = "VS";
    matchup.append(createPlayer(left, "a", isSuhit(left)), versus, createPlayer(right, "b", isSuhit(right)));
    row.append(number, matchup);
    const historyNote = createHistoryNote(left, right);
    if (historyNote) row.append(historyNote);
    fragment.append(row);
  });
  ui.resultList.replaceChildren(fragment);
}

function validatePairs() {
  const names = state.pairs.flat().map((name) => name.trim());
  if (names.some((name) => !name)) return "열 명의 이름을 모두 입력해 주세요.";
  const canonical = names.map(canonicalParticipant);
  if (new Set(canonical).size !== canonical.length) return "중복된 이름이 있습니다. 각 참가자를 한 번씩만 입력해 주세요.";
  return "";
}

function randomSwap() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return Boolean(value[0] & 1);
  }
  return Math.random() >= 0.5;
}

ui.pairs.addEventListener("input", (event) => {
  const input = event.target.closest("input[data-pair]");
  if (!input) return;
  const pairIndex = Number(input.dataset.pair);
  const participantIndex = Number(input.dataset.participant);
  state.pairs[pairIndex][participantIndex] = input.value;
  state.result = [];
  saveMixerState();
  renderResult();
  setStatus("");
});

ui.shuffle.addEventListener("click", () => {
  const error = validatePairs();
  if (error) return setStatus(error, true);
  state.result = state.pairs.map(([first, second]) => randomSwap()
    ? [second.trim(), first.trim()]
    : [first.trim(), second.trim()]
  );
  saveMixerState();
  renderResult();
  setStatus("두 팀을 5대5로 섞었습니다.");
});

async function copyResult() {
  const text = state.result.map(([left, right]) => `${left} vs ${right}`).join("\n");
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  setStatus("다섯 개의 밸런스 결과를 복사했습니다.");
}

ui.copy.addEventListener("click", copyResult);

ui.reset.addEventListener("click", () => {
  state = { pairs: emptyPairs(), result: [] };
  saveMixerState();
  createPairInputs();
  renderResult();
  setStatus("입력과 배치 결과를 초기화했습니다.");
});

ui.close.addEventListener("click", () => {
  window.close();
  window.setTimeout(() => {
    if (!window.closed) window.location.href = "index.html";
  }, 120);
});

window.addEventListener("storage", (event) => {
  if (event.key === LAND_RECORDS_STORAGE_KEY) renderResult();
});

createPairInputs();
renderResult();
