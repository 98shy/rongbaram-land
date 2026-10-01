const DDRAGON_ROOT = "https://ddragon.leagueoflegends.com";
const FALLBACK_VERSION = "16.18.1";
const STORAGE_KEY = "lol-champion-tracker:used-v1";
const RECORD_STORAGE_KEY = "lol-champion-tracker:record-v1";
const MATCH_STORAGE_KEY = "lol-champion-tracker:matches-v1";
const CHAMPION_ALIASES = {
  Morgana: ["몰가"],
  Pantheon: ["빵테"],
  Renata: ["레나타"],
  Fiddlesticks: ["피들"],
  Heimerdinger: ["딩거", "하이머"],
  DrMundo: ["문도"],
  MasterYi: ["마이"],
  MonkeyKing: ["손오공"],
  Nunu: ["누누"],
  TahmKench: ["탐켄치"],
};
const KOREAN_INITIALS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

const state = {
  champions: [],
  used: new Set(readStoredUsed()),
  version: "",
  query: "",
  role: "all",
  status: "all",
  history: [],
  record: readStoredRecord(),
  matchState: readStoredMatchState(),
  replacingMatchId: null,
};

const ui = {
  grid: document.querySelector("#championGrid"),
  loading: document.querySelector("#loadingState"),
  error: document.querySelector("#errorState"),
  empty: document.querySelector("#emptyState"),
  search: document.querySelector("#searchInput"),
  roles: document.querySelector("#roleFilters"),
  statuses: document.querySelector("#statusFilters"),
  resultCount: document.querySelector("#resultCount"),
  patchInfo: document.querySelector("#patchInfo"),
  undo: document.querySelector("#undoButton"),
  reset: document.querySelector("#resetButton"),
  retry: document.querySelector("#retryButton"),
  toast: document.querySelector("#toast"),
  winCount: document.querySelector("#winCount"),
  lossCount: document.querySelector("#lossCount"),
  winControlCount: document.querySelector("#winControlCount"),
  lossControlCount: document.querySelector("#lossControlCount"),
  winRate: document.querySelector("#winRate"),
  recordControls: document.querySelector(".record-card__controls"),
  recordReset: document.querySelector("#recordResetButton"),
  stakeCount: document.querySelector("#stakeCount"),
  stakeControls: document.querySelector("#stakeControls"),
  settlementResult: document.querySelector("#settlementResult"),
  championTooltip: document.querySelector("#championTooltip"),
  matchHistoryButton: document.querySelector("#matchHistoryButton"),
  matchHistoryBadge: document.querySelector("#matchHistoryBadge"),
  matchHistoryDialog: document.querySelector("#matchHistoryDialog"),
  matchHistoryClose: document.querySelector("#matchHistoryCloseButton"),
  pendingMatchCount: document.querySelector("#pendingMatchCount"),
  pendingMatchList: document.querySelector("#pendingMatchList"),
  completedMatchCount: document.querySelector("#completedMatchCount"),
  completedMatchList: document.querySelector("#completedMatchList"),
  mappingStatus: document.querySelector("#mappingStatus"),
  mappingStatusText: document.querySelector("#mappingStatusText"),
  cancelChampionChange: document.querySelector("#cancelChampionChangeButton"),
};

let toastTimer;

function readStoredUsed() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveUsed() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.used]));
  } catch {
    // 저장소가 차단된 브라우저에서도 화면 조작은 계속 동작합니다.
  }
}

function readStoredRecord() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECORD_STORAGE_KEY));
    const storedStake = Number.parseInt(saved?.stake, 10);
    return {
      wins: Math.max(0, Number.parseInt(saved?.wins, 10) || 0),
      losses: Math.max(0, Number.parseInt(saved?.losses, 10) || 0),
      stake: Number.isFinite(storedStake) ? Math.max(0, Math.round(storedStake / 100) * 100) : 100,
    };
  } catch {
    return { wins: 0, losses: 0, stake: 100 };
  }
}

function readStoredMatchState() {
  const emptyState = { matches: [], pendingResults: [], pendingChampions: [], replacement: null };
  try {
    const saved = JSON.parse(localStorage.getItem(MATCH_STORAGE_KEY));
    if (!saved || typeof saved !== "object") return emptyState;
    const validResult = (result) => result === "win" || result === "loss";
    return {
      matches: Array.isArray(saved.matches)
        ? saved.matches.filter((match) => match && match.id && match.championId && validResult(match.result))
        : [],
      pendingResults: Array.isArray(saved.pendingResults)
        ? saved.pendingResults.filter(validResult)
        : [],
      pendingChampions: Array.isArray(saved.pendingChampions)
        ? saved.pendingChampions.filter((id) => typeof id === "string")
        : [],
      replacement: saved.replacement && validResult(saved.replacement.result)
        ? saved.replacement
        : null,
    };
  } catch {
    return emptyState;
  }
}

function saveRecord() {
  try {
    localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(state.record));
  } catch {
    // 저장소가 차단된 브라우저에서도 전적 조작은 계속 동작합니다.
  }
}

function saveMatchState() {
  try {
    localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(state.matchState));
  } catch {
    // 저장소가 차단된 브라우저에서도 매핑 기능은 계속 동작합니다.
  }
}

function createMatchId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getChampionName(id) {
  return state.champions.find((champion) => champion.id === id)?.name ?? id;
}

function takeSnapshot() {
  state.history.push({
    used: [...state.used],
    record: { ...state.record },
    matchState: JSON.parse(JSON.stringify(state.matchState)),
  });
  if (state.history.length > 50) state.history.shift();
}

function saveGameState() {
  saveUsed();
  saveRecord();
  saveMatchState();
}

function renderRecord() {
  const { wins, losses, stake } = state.record;
  const games = wins + losses;
  const rate = games ? `${Math.round((wins / games) * 100)}%` : "—";
  const settlement = (wins - losses) * stake;
  ui.winCount.textContent = wins;
  ui.lossCount.textContent = losses;
  ui.winControlCount.textContent = wins;
  ui.lossControlCount.textContent = losses;
  ui.winRate.textContent = rate;
  ui.stakeCount.textContent = `${stake.toLocaleString("ko-KR")}개`;
  ui.settlementResult.textContent = `${settlement > 0 ? "+" : ""}${settlement.toLocaleString("ko-KR")}개`;
  ui.settlementResult.classList.toggle("is-positive", settlement > 0);
  ui.settlementResult.classList.toggle("is-negative", settlement < 0);
  ui.recordControls.querySelector('[data-record="win"][data-delta="-1"]').disabled = wins === 0;
  ui.recordControls.querySelector('[data-record="loss"][data-delta="-1"]').disabled = losses === 0;
  ui.stakeControls.querySelector('[data-stake-delta="-100"]').disabled = stake < 100;
  ui.stakeControls.querySelector('[data-stake-delta="-1000"]').disabled = stake < 1000;
}

function resultLabel(result) {
  return result === "win" ? "승리" : "패배";
}

function attemptMatches() {
  const created = [];
  while (state.matchState.pendingResults.length && state.matchState.pendingChampions.length) {
    const result = state.matchState.pendingResults.shift();
    const championId = state.matchState.pendingChampions.shift();
    const match = { id: createMatchId(), championId, result, createdAt: Date.now() };
    state.matchState.matches.push(match);
    created.push(match);
  }
  return created;
}

function createEmptyMessage(message) {
  const element = document.createElement("p");
  element.className = "match-dialog__empty";
  element.textContent = message;
  return element;
}

function createSmallButton(label, action, value) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "match-record__action";
  button.textContent = label;
  button.dataset.action = action;
  if (value !== undefined) button.dataset.value = String(value);
  return button;
}

function renderMatchHistory() {
  const { matches, pendingResults, pendingChampions, replacement } = state.matchState;
  const pendingCount = pendingResults.length + pendingChampions.length + (replacement ? 1 : 0);
  const totalVisible = matches.length + pendingCount;

  ui.matchHistoryBadge.hidden = totalVisible === 0;
  ui.matchHistoryBadge.textContent = pendingCount ? `대기 ${pendingCount}` : String(matches.length);
  ui.matchHistoryButton.classList.toggle("has-pending", pendingCount > 0);
  ui.pendingMatchCount.textContent = `${pendingCount}개`;
  ui.completedMatchCount.textContent = `${matches.length}경기`;

  const changingMatch = matches.find((match) => match.id === state.replacingMatchId);
  if (changingMatch) {
    ui.mappingStatus.hidden = false;
    ui.mappingStatusText.textContent = `${getChampionName(changingMatch.championId)} 대신 사용할 챔피언을 선택하세요.`;
    ui.cancelChampionChange.hidden = false;
  } else if (replacement) {
    ui.mappingStatus.hidden = false;
    ui.mappingStatusText.textContent = `${resultLabel(replacement.result)} 기록에 다시 연결할 챔피언을 선택하세요.`;
    ui.cancelChampionChange.hidden = false;
  } else if (pendingCount) {
    const wins = pendingResults.filter((result) => result === "win").length;
    const losses = pendingResults.length - wins;
    const parts = [];
    if (wins) parts.push(`승리 ${wins}`);
    if (losses) parts.push(`패배 ${losses}`);
    if (pendingChampions.length) parts.push(`챔피언 ${pendingChampions.length}`);
    ui.mappingStatus.hidden = false;
    ui.mappingStatusText.textContent = `매핑 대기 · ${parts.join(" · ")}`;
    ui.cancelChampionChange.hidden = true;
  } else {
    ui.mappingStatus.hidden = true;
    ui.cancelChampionChange.hidden = true;
  }

  const pendingFragment = document.createDocumentFragment();
  if (replacement) {
    const row = document.createElement("div");
    row.className = "pending-match pending-match--active";
    const text = document.createElement("span");
    text.textContent = `${resultLabel(replacement.result)} · 새 챔피언 선택 중`;
    row.append(text, createSmallButton("취소", "cancel-replacement"));
    pendingFragment.append(row);
  }
  pendingResults.forEach((result, index) => {
    const row = document.createElement("div");
    row.className = "pending-match";
    const text = document.createElement("span");
    text.textContent = `${resultLabel(result)} · 챔피언 선택 필요`;
    row.append(text, createSmallButton("대기 취소", "remove-pending-result", index));
    pendingFragment.append(row);
  });
  pendingChampions.forEach((championId, index) => {
    const row = document.createElement("div");
    row.className = "pending-match";
    const text = document.createElement("span");
    text.textContent = `${getChampionName(championId)} · 결과 선택 필요`;
    row.append(text, createSmallButton("선택 취소", "remove-pending-champion", index));
    pendingFragment.append(row);
  });
  if (!pendingCount) pendingFragment.append(createEmptyMessage("현재 매핑을 기다리는 기록이 없습니다."));
  ui.pendingMatchList.replaceChildren(pendingFragment);

  const completedFragment = document.createDocumentFragment();
  const trackedResults = matches.length + pendingResults.length + (replacement ? 1 : 0);
  const legacyCount = Math.max(0, state.record.wins + state.record.losses - trackedResults);
  if (legacyCount) {
    const notice = document.createElement("p");
    notice.className = "match-dialog__legacy";
    notice.textContent = `기존 전적 ${legacyCount}경기는 자동 매핑 적용 이전 합계라 상세 기록에 표시되지 않습니다.`;
    completedFragment.append(notice);
  }
  [...matches].sort((a, b) => a.createdAt - b.createdAt)
    .map((match, index) => ({ match, number: index + 1 })).forEach(({ match, number }) => {
    const row = document.createElement("article");
    row.className = "match-record";
    const numberElement = document.createElement("span");
    numberElement.className = "match-record__number";
    numberElement.textContent = `${number}경기`;
    const resultElement = document.createElement("strong");
    resultElement.className = `match-record__result match-record__result--${match.result}`;
    resultElement.textContent = resultLabel(match.result);
    const championElement = document.createElement("img");
    championElement.className = "match-record__champion";
    const champion = state.champions.find((item) => item.id === match.championId);
    championElement.src = `${DDRAGON_ROOT}/cdn/${state.version || FALLBACK_VERSION}/img/champion/${champion?.image.full ?? `${match.championId}.png`}`;
    championElement.alt = getChampionName(match.championId);
    championElement.title = getChampionName(match.championId);
    championElement.width = 44;
    championElement.height = 44;
    championElement.loading = "lazy";
    const actions = document.createElement("div");
    actions.className = "match-record__actions";
    actions.append(
      createSmallButton("챔피언 변경", "change-champion", match.id),
      createSmallButton("삭제", "delete-match", match.id)
    );
    row.append(numberElement, resultElement, championElement, actions);
    completedFragment.append(row);
  });
  if (!matches.length && !legacyCount) completedFragment.append(createEmptyMessage("아직 완료된 경기 기록이 없습니다."));
  ui.completedMatchList.replaceChildren(completedFragment);
}

function renderGameState() {
  renderRecord();
  render();
  renderMatchHistory();
}

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadChampions() {
  ui.loading.hidden = false;
  ui.error.hidden = true;
  ui.grid.hidden = true;

  try {
    let version = FALLBACK_VERSION;
    try {
      const versions = await getJSON(`${DDRAGON_ROOT}/api/versions.json`);
      if (versions[0]) version = versions[0];
    } catch {
      // 최신 버전 확인만 실패하면 검증된 기본 버전으로 계속 진행합니다.
    }

    const payload = await getJSON(`${DDRAGON_ROOT}/cdn/${version}/data/ko_KR/champion.json`);
    state.version = version;
    state.champions = Object.values(payload.data).sort((a, b) =>
      a.name.localeCompare(b.name, "ko-KR")
    );

    const validIds = new Set(state.champions.map((champion) => champion.id));
    state.used = new Set([...state.used].filter((id) => validIds.has(id)));
    state.matchState.matches = state.matchState.matches.filter((match) => validIds.has(match.championId));
    state.matchState.pendingChampions = state.matchState.pendingChampions.filter((id) => validIds.has(id));
    state.matchState.matches.forEach((match) => state.used.add(match.championId));
    state.matchState.pendingChampions.forEach((id) => state.used.add(id));
    saveGameState();

    ui.patchInfo.textContent = `Riot Data Dragon · 패치 ${version}`;
    ui.loading.hidden = true;
    ui.grid.hidden = false;
    renderGameState();
  } catch (error) {
    console.error(error);
    ui.loading.hidden = true;
    ui.error.hidden = false;
  }
}

function normalizeSearchText(value) {
  return value.toLocaleLowerCase("ko-KR").replace(/[\s·.'’_-]+/g, "");
}

function getKoreanInitials(value) {
  return [...value].map((character) => {
    const code = character.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? KOREAN_INITIALS[Math.floor(code / 588)] : character;
  }).join("");
}

function isOrderedAbbreviation(query, target) {
  if (query.length < 2) return false;
  let queryIndex = 0;
  for (const character of target) {
    if (character === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return true;
  }
  return false;
}

function matchesChampionSearch(champion, query) {
  if (!query) return true;
  const searchableNames = [champion.name, champion.id, ...(CHAMPION_ALIASES[champion.id] ?? [])]
    .map(normalizeSearchText);

  if (searchableNames.some((name) => name.includes(query))) return true;
  if (/^[ㄱ-ㅎ]+$/.test(query)) {
    return searchableNames.some((name) => getKoreanInitials(name).includes(query));
  }
  return searchableNames.some((name) => isOrderedAbbreviation(query, name));
}

function getFilteredChampions() {
  const normalizedQuery = normalizeSearchText(state.query);
  return state.champions.filter((champion) => {
    const matchesSearch = matchesChampionSearch(champion, normalizedQuery);
    const matchesRole = state.role === "all" || champion.tags.includes(state.role);
    const isUsed = state.used.has(champion.id);
    const matchesStatus = state.status === "all" ||
      (state.status === "used" && isUsed) ||
      (state.status === "unused" && !isUsed);
    return matchesSearch && matchesRole && matchesStatus;
  });
}

function createChampionButton(champion) {
  const isUsed = state.used.has(champion.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `champion${isUsed ? " is-used" : ""}`;
  button.dataset.championId = champion.id;
  button.dataset.championName = champion.name;
  button.setAttribute("aria-pressed", String(isUsed));
  button.setAttribute("aria-label", `${champion.name}, ${isUsed ? "사용 완료" : "미사용"}`);

  const portrait = document.createElement("span");
  portrait.className = "champion__portrait";
  const image = document.createElement("img");
  image.src = `${DDRAGON_ROOT}/cdn/${state.version}/img/champion/${champion.image.full}`;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";

  const shade = document.createElement("span");
  shade.className = "champion__shade";
  const ban = document.createElement("span");
  ban.className = "champion__ban";
  ban.setAttribute("aria-hidden", "true");
  portrait.append(image, shade, ban);
  button.append(portrait);
  return button;
}

function render() {
  const filtered = getFilteredChampions();
  const fragment = document.createDocumentFragment();
  filtered.forEach((champion) => fragment.append(createChampionButton(champion)));
  ui.grid.replaceChildren(fragment);
  ui.empty.hidden = filtered.length !== 0 || state.champions.length === 0;
  ui.grid.hidden = filtered.length === 0;
  ui.resultCount.textContent = `${filtered.length}명 표시 중`;
  ui.undo.disabled = state.history.length === 0;
}

function toggleChampion(id) {
  const championName = getChampionName(id);
  const changingMatch = state.matchState.matches.find((match) => match.id === state.replacingMatchId);

  if (changingMatch) {
    if (id === changingMatch.championId) {
      state.replacingMatchId = null;
      renderMatchHistory();
      return showToast("챔피언 변경을 취소했습니다.");
    }
    if (state.used.has(id)) return showToast("이미 사용한 챔피언은 선택할 수 없습니다.");
    takeSnapshot();
    const previousChampionId = changingMatch.championId;
    changingMatch.championId = id;
    state.used.delete(previousChampionId);
    state.used.add(id);
    state.replacingMatchId = null;
    saveGameState();
    renderGameState();
    return showToast(`${getChampionName(previousChampionId)}에서 ${championName}(으)로 변경했습니다.`);
  }

  if (state.matchState.replacement && !state.used.has(id)) {
    takeSnapshot();
    const replacement = state.matchState.replacement;
    state.matchState.matches.push({
      id: replacement.id ?? createMatchId(),
      championId: id,
      result: replacement.result,
      createdAt: replacement.createdAt ?? Date.now(),
    });
    state.matchState.replacement = null;
    state.matchState.matches.sort((a, b) => a.createdAt - b.createdAt);
    state.used.add(id);
    saveGameState();
    renderGameState();
    return showToast(`${championName} · ${resultLabel(replacement.result)} 기록과 다시 연결했습니다.`);
  }

  const wasUsed = state.used.has(id);
  takeSnapshot();
  if (wasUsed) {
    const pendingIndex = state.matchState.pendingChampions.indexOf(id);
    const matchIndex = state.matchState.matches.findIndex((match) => match.championId === id);
    if (pendingIndex >= 0) {
      state.matchState.pendingChampions.splice(pendingIndex, 1);
    } else if (matchIndex >= 0) {
      const [match] = state.matchState.matches.splice(matchIndex, 1);
      if (state.matchState.replacement) {
        state.matchState.pendingResults.unshift(state.matchState.replacement.result);
      }
      state.matchState.replacement = {
        id: match.id,
        result: match.result,
        createdAt: match.createdAt,
      };
    }
    state.used.delete(id);
  } else {
    state.used.add(id);
    state.matchState.pendingChampions.push(id);
  }

  const created = wasUsed ? [] : attemptMatches();
  saveGameState();
  renderGameState();
  if (created.length) {
    const match = created.at(-1);
    showToast(`${getChampionName(match.championId)} · ${resultLabel(match.result)} 기록 완료`);
  } else if (wasUsed && state.matchState.replacement) {
    showToast(`${championName} 선택을 취소했습니다. 새 챔피언을 선택하세요.`);
  } else {
    showToast(`${championName} · ${wasUsed ? "미사용으로 변경" : "결과 선택 대기"}`);
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => ui.toast.classList.remove("is-visible"), 1800);
}

ui.grid.addEventListener("click", (event) => {
  const champion = event.target.closest(".champion");
  if (champion) toggleChampion(champion.dataset.championId);
});

ui.grid.addEventListener("pointermove", (event) => {
  const champion = event.target.closest(".champion");
  if (!champion) {
    ui.championTooltip.hidden = true;
    return;
  }
  ui.championTooltip.textContent = champion.dataset.championName;
  ui.championTooltip.hidden = false;
  const bounds = ui.championTooltip.getBoundingClientRect();
  const left = Math.min(event.clientX, window.innerWidth - bounds.width - 16);
  const top = Math.min(event.clientY, window.innerHeight - bounds.height - 16);
  ui.championTooltip.style.left = `${Math.max(0, left)}px`;
  ui.championTooltip.style.top = `${Math.max(0, top)}px`;
});

ui.grid.addEventListener("pointerleave", () => {
  ui.championTooltip.hidden = true;
});

ui.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

ui.roles.addEventListener("click", (event) => {
  const button = event.target.closest("[data-role]");
  if (!button) return;
  state.role = button.dataset.role;
  ui.roles.querySelectorAll("[data-role]").forEach((item) => item.classList.toggle("is-active", item === button));
  render();
});

ui.statuses.addEventListener("click", (event) => {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  state.status = button.dataset.status;
  ui.statuses.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
  render();
});

ui.undo.addEventListener("click", () => {
  const previous = state.history.pop();
  if (!previous) return;
  state.used = new Set(previous.used);
  state.record = { ...previous.record, stake: state.record.stake };
  state.matchState = JSON.parse(JSON.stringify(previous.matchState));
  state.replacingMatchId = null;
  saveGameState();
  renderGameState();
  showToast("마지막 변경을 취소했습니다.");
});

ui.reset.addEventListener("click", () => {
  if (!state.used.size) return showToast("초기화할 기록이 없습니다.");
  if (!window.confirm(`${state.used.size}명의 사용 기록을 모두 초기화할까요? 연결된 승패는 다시 매핑 대기 상태가 됩니다.`)) return;
  takeSnapshot();
  const returnedResults = state.matchState.matches.map((match) => match.result);
  if (state.matchState.replacement) returnedResults.push(state.matchState.replacement.result);
  state.matchState.pendingResults = [...returnedResults, ...state.matchState.pendingResults];
  state.matchState.matches = [];
  state.matchState.pendingChampions = [];
  state.matchState.replacement = null;
  state.replacingMatchId = null;
  state.used.clear();
  saveGameState();
  renderGameState();
  showToast("모든 사용 기록을 초기화했습니다.");
});

ui.retry.addEventListener("click", loadChampions);

ui.recordControls.querySelectorAll("[data-record]").forEach((button) => {
  button.addEventListener("click", () => {
    const result = button.dataset.record;
    const key = result === "win" ? "wins" : "losses";
    const delta = Number(button.dataset.delta);
    state.history = [];
    if (delta > 0) {
      state.record[key] += 1;
      state.matchState.pendingResults.push(result);
      const created = attemptMatches();
      saveGameState();
      renderGameState();
      if (created.length) {
        const match = created.at(-1);
        showToast(`${getChampionName(match.championId)} · ${resultLabel(match.result)} 기록 완료`);
      } else {
        showToast(`${resultLabel(result)} · 챔피언 선택 대기`);
      }
      return;
    }

    if (state.record[key] === 0) return;
    let message = `${resultLabel(result)} 1회를 취소했습니다.`;
    if (state.matchState.replacement?.result === result) {
      state.matchState.replacement = null;
    } else {
      const pendingIndex = state.matchState.pendingResults.lastIndexOf(result);
      if (pendingIndex >= 0) {
        state.matchState.pendingResults.splice(pendingIndex, 1);
      } else {
        const matchIndex = state.matchState.matches.findLastIndex((match) => match.result === result);
        if (matchIndex >= 0) {
          const [removedMatch] = state.matchState.matches.splice(matchIndex, 1);
          state.used.delete(removedMatch.championId);
          if (state.replacingMatchId === removedMatch.id) state.replacingMatchId = null;
          message = `${getChampionName(removedMatch.championId)}의 ${resultLabel(result)} 기록을 취소했습니다.`;
        }
      }
    }
    state.record[key] -= 1;
    saveGameState();
    renderGameState();
    showToast(message);
  });
});

ui.stakeControls.querySelectorAll("[data-stake-delta]").forEach((button) => {
  button.addEventListener("click", () => {
    const delta = Number(button.dataset.stakeDelta);
    state.record.stake = Math.max(0, state.record.stake + delta);
    renderRecord();
    saveRecord();
  });
});

ui.recordReset.addEventListener("click", () => {
  if (state.record.wins + state.record.losses === 0) return showToast("초기화할 전적이 없습니다.");
  if (!window.confirm("현재 승패와 연결된 경기 기록을 모두 초기화할까요?")) return;
  state.history = [];
  state.matchState.matches.forEach((match) => state.used.delete(match.championId));
  state.record = { ...state.record, wins: 0, losses: 0 };
  state.matchState.matches = [];
  state.matchState.pendingResults = [];
  state.matchState.replacement = null;
  state.replacingMatchId = null;
  saveGameState();
  renderGameState();
  showToast("승패 기록을 초기화했습니다.");
});

function cancelChampionReplacement() {
  if (state.replacingMatchId) {
    state.replacingMatchId = null;
    renderMatchHistory();
    return showToast("챔피언 변경을 취소했습니다.");
  }
  if (!state.matchState.replacement) return;
  state.history = [];
  state.matchState.pendingResults.unshift(state.matchState.replacement.result);
  state.matchState.replacement = null;
  const created = attemptMatches();
  saveGameState();
  renderGameState();
  showToast(created.length ? "대기 중인 챔피언과 다시 연결했습니다." : "승패 기록을 일반 대기열로 이동했습니다.");
}

ui.cancelChampionChange.addEventListener("click", cancelChampionReplacement);

function closeMatchHistory() {
  ui.matchHistoryDialog.close();
  ui.matchHistoryButton.setAttribute("aria-expanded", "false");
}

function positionMatchHistory() {
  if (!ui.matchHistoryDialog.open) return;
  const bounds = ui.matchHistoryButton.getBoundingClientRect();
  const width = Math.min(420, window.innerWidth - 24);
  const left = Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12));
  const top = Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - 180));
  ui.matchHistoryDialog.style.width = `${width}px`;
  ui.matchHistoryDialog.style.left = `${left}px`;
  ui.matchHistoryDialog.style.top = `${top}px`;
  ui.matchHistoryDialog.style.setProperty("--panel-height", `${Math.max(160, window.innerHeight - top - 12)}px`);
}

ui.matchHistoryButton.addEventListener("click", () => {
  if (ui.matchHistoryDialog.open) return closeMatchHistory();
  renderMatchHistory();
  ui.matchHistoryDialog.show();
  ui.matchHistoryButton.setAttribute("aria-expanded", "true");
  positionMatchHistory();
});

ui.matchHistoryClose.addEventListener("click", () => {
  closeMatchHistory();
  ui.matchHistoryButton.focus();
});
document.addEventListener("pointerdown", (event) => {
  if (ui.matchHistoryDialog.open && !ui.matchHistoryDialog.contains(event.target)
    && !ui.matchHistoryButton.contains(event.target)) closeMatchHistory();
});
window.addEventListener("resize", positionMatchHistory);
window.addEventListener("scroll", positionMatchHistory, true);

ui.pendingMatchList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "cancel-replacement") return cancelChampionReplacement();
  state.history = [];
  const index = Number(button.dataset.value);
  if (action === "remove-pending-result") {
    const [result] = state.matchState.pendingResults.splice(index, 1);
    if (!result) return;
    const key = result === "win" ? "wins" : "losses";
    state.record[key] = Math.max(0, state.record[key] - 1);
  } else if (action === "remove-pending-champion") {
    const [championId] = state.matchState.pendingChampions.splice(index, 1);
    if (!championId) return;
    state.used.delete(championId);
  }
  saveGameState();
  renderGameState();
  showToast("대기 기록을 취소했습니다.");
});

ui.completedMatchList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const matchIndex = state.matchState.matches.findIndex((match) => match.id === button.dataset.value);
  if (matchIndex < 0) return;
  const match = state.matchState.matches[matchIndex];

  if (button.dataset.action === "change-champion") {
    state.replacingMatchId = match.id;
    closeMatchHistory();
    renderMatchHistory();
    ui.grid.scrollIntoView({ behavior: "smooth", block: "start" });
    return showToast(`${getChampionName(match.championId)} 대신 사용할 챔피언을 선택하세요.`);
  }

  if (button.dataset.action === "delete-match") {
    if (!window.confirm(`${getChampionName(match.championId)}의 ${resultLabel(match.result)} 기록을 삭제할까요?`)) return;
    state.history = [];
    state.matchState.matches.splice(matchIndex, 1);
    const key = match.result === "win" ? "wins" : "losses";
    state.record[key] = Math.max(0, state.record[key] - 1);
    state.used.delete(match.championId);
    if (state.replacingMatchId === match.id) state.replacingMatchId = null;
    saveGameState();
    renderGameState();
    showToast("경기 기록을 삭제했습니다.");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && ui.matchHistoryDialog.open) {
    closeMatchHistory();
    ui.matchHistoryButton.focus();
    return;
  }
  if (event.key === "/" && !ui.matchHistoryDialog.open && document.activeElement !== ui.search) {
    event.preventDefault();
    ui.search.focus();
  }
  if (event.key === "Escape" && document.activeElement === ui.search) {
    ui.search.value = "";
    state.query = "";
    ui.search.blur();
    render();
  }
});

renderRecord();
renderMatchHistory();
loadChampions();
