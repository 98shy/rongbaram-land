const MIXER_STORAGE_KEY = "rongbaram-land:team-mixer-v1";
const LAND_RECORDS_STORAGE_KEY = "lol-champion-tracker:land-records-v1";
const PAIR_COUNT = 5;
const SUHIT_ALIASES = new Set(["수힛", "수히"]);

const ui = {
  pairs: document.querySelector("#mixerPairs"),
  resultList: document.querySelector("#mixerResultList"),
  empty: document.querySelector("#mixerEmpty"),
  shuffle: document.querySelector("#mixerShuffleButton"),
  complete: document.querySelector("#mixerCompleteButton"),
  reset: document.querySelector("#mixerResetButton"),
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

function normalizedResult(value) {
  if (!Array.isArray(value)) return [];
  const result = value.slice(0, PAIR_COUNT).map((pair) => [String(pair?.[0] ?? ""), String(pair?.[1] ?? "")]);
  return result.length === PAIR_COUNT ? result : [];
}

function readMixerState() {
  const fallback = { pairs: emptyPairs(), result: [], confirmedResult: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(MIXER_STORAGE_KEY));
    if (!saved || !Array.isArray(saved.pairs)) return fallback;
    const pairs = emptyPairs().map((pair, index) => {
      const savedPair = saved.pairs[index];
      if (!Array.isArray(savedPair)) return pair;
      return [String(savedPair[0] ?? ""), String(savedPair[1] ?? "")];
    });
    return {
      pairs,
      result: normalizedResult(saved.result),
      confirmedResult: normalizedResult(saved.confirmedResult),
    };
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
    const saved = JSON.parse(localStorage.getItem(LAND_RECORDS_STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function participantStats(name) {
  const target = canonicalParticipant(name);
  return readLandRecords().reduce((stats, record) => {
    const teams = normalizedResult(record?.teamResult);
    if (!teams.length) return stats;
    const blue = teams.map((pair) => pair[0]);
    const red = teams.map((pair) => pair[1]);
    const suhitIsBlue = blue.some(isSuhit);
    const suhitIsRed = red.some(isSuhit);
    if (suhitIsBlue === suhitIsRed) return stats;
    const participantIsBlue = blue.some((player) => canonicalParticipant(player) === target);
    const participantIsRed = red.some((player) => canonicalParticipant(player) === target);
    if (participantIsBlue === participantIsRed) return stats;
    const sameTeam = participantIsBlue === suhitIsBlue;
    const wins = Math.max(0, Number.parseInt(record.wins, 10) || 0);
    const losses = Math.max(0, Number.parseInt(record.losses, 10) || 0);
    const stake = Math.max(0, Number.parseInt(record.stake, 10) || 0);
    const storedSettlement = Number(record.settlement);
    const settlement = Number.isFinite(storedSettlement) ? storedSettlement : (wins - losses) * stake;
    stats.wins += sameTeam ? wins : losses;
    stats.losses += sameTeam ? losses : wins;
    stats.settlement += sameTeam ? settlement : -settlement;
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
      input.placeholder = "이름";
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
  const player = document.createElement("div");
  player.className = `mixer-player mixer-player--${team}`;
  if (highlighted) player.classList.add("is-suhit");
  const playerName = document.createElement("strong");
  playerName.textContent = name;
  const stats = participantStats(name);
  const statsBox = document.createElement("span");
  statsBox.className = "mixer-player__stats";
  const record = document.createElement("span");
  record.textContent = `현재 전적 ${stats.wins}승 ${stats.losses}패`;
  const settlement = document.createElement("span");
  settlement.textContent = `최종 결산 ${formatSettlement(stats.settlement)}`;
  if (stats.settlement > 0) settlement.className = "is-positive";
  if (stats.settlement < 0) settlement.className = "is-negative";
  statsBox.append(record, settlement);
  player.append(playerName, statsBox);
  return player;
}

function renderResult() {
  const hasResult = state.result.length === PAIR_COUNT;
  ui.empty.hidden = hasResult;
  ui.complete.disabled = !hasResult;
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
  setStatus("팀 섞기 완료");
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
}

ui.complete.addEventListener("click", async () => {
  state.confirmedResult = state.result.map((pair) => [...pair]);
  saveMixerState();
  await copyResult();
  setStatus("팀 섞기 완료 · 팀 구성을 기억하고 클립보드에 복사했습니다.");
});

ui.reset.addEventListener("click", () => {
  state = { pairs: emptyPairs(), result: [], confirmedResult: [] };
  saveMixerState();
  createPairInputs();
  renderResult();
  setStatus("입력과 배치 결과를 초기화했습니다.");
});

window.addEventListener("storage", (event) => {
  if (event.key === LAND_RECORDS_STORAGE_KEY) renderResult();
});

createPairInputs();
renderResult();
