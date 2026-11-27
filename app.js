const DDRAGON_ROOT = "https://ddragon.leagueoflegends.com";
const FALLBACK_VERSION = "16.18.1";
const STORAGE_KEY = "lol-champion-tracker:used-v1";
const RECORD_STORAGE_KEY = "lol-champion-tracker:record-v1";
const MATCH_STORAGE_KEY = "lol-champion-tracker:matches-v1";
const LAND_RECORDS_STORAGE_KEY = "lol-champion-tracker:land-records-v1";
const MIXER_STORAGE_KEY = "rongbaram-land:team-mixer-v1";
const TEAM_EVENTS_STORAGE_KEY = "rongbaram-land:pending-team-events-v1";
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
const compactRecord = document.querySelector("#mixerRecord");
let renderCompactRecord;

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
  recordSave: document.querySelector("#recordSaveButton"),
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
        ? saved.pendingResults.map((entry) => typeof entry === "string" ? { result: entry } : entry)
          .filter((entry) => validResult(entry?.result))
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

function readLandRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAND_RECORDS_STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function readMixerMapping() {
  try {
    const saved = JSON.parse(localStorage.getItem(MIXER_STORAGE_KEY));
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

function validMixerTeams(value) {
  if (!Array.isArray(value) || value.length !== 5) return [];
  const teams = value.map((pair) => [String(pair?.[0] ?? "").trim(), String(pair?.[1] ?? "").trim()]);
  return teams.every((pair) => pair[0] && pair[1]) ? teams : [];
}

function isMixerHost(name) {
  return ["수힛", "수히"].includes(name.normalize("NFKC").replace(/\s+/g, ""));
}

function findMixerOpponent(pairs) {
  if (!Array.isArray(pairs)) return "";
  const names = pairs.map((pair) => [String(pair?.[0] ?? "").trim(), String(pair?.[1] ?? "").trim()]);
  if (names.flat().filter(isMixerHost).length !== 1) return "";
  const pair = names.find((namesInPair) => namesInPair.some(isMixerHost));
  return pair.find((name) => !isMixerHost(name)) ?? "";
}

function getMixerSaveBalance() {
  const opponents = new Map();
  for (const event of readPendingTeamEvents()) {
    const name = findMixerOpponent(event?.teamResult);
    if (name) opponents.set(name.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR"), name);
  }
  if (opponents.size > 1) return "";
  if (opponents.size === 1) return opponents.values().next().value;
  const mapping = readMixerMapping();
  return findMixerOpponent(mapping?.result) || findMixerOpponent(mapping?.pairs);
}

function readPendingTeamEvents() {
  try {
    const saved = JSON.parse(localStorage.getItem(TEAM_EVENTS_STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function savePendingTeamEvents(events) {
  localStorage.setItem(TEAM_EVENTS_STORAGE_KEY, JSON.stringify(events));
}

function getCompletedTeamEvents(matchState = readStoredMatchState()) {
  const completedIds = new Set(matchState.matches.map(({ id }) => id));
  const completedCounts = { win: 0, loss: 0 };
  for (const { result } of matchState.matches) completedCounts[result] += 1;
  return readPendingTeamEvents().filter((event) => event?.linkedById
    ? completedIds.has(event.id)
    : event?.recordCount > 0 && event.recordCount <= completedCounts[event.result]);
}

function consumeMixerAssignment({ id, result }) {
  const mapping = readMixerMapping();
  const teams = validMixerTeams(mapping?.confirmedResult);
  if (!mapping?.armed || !teams.length) return;
  const events = readPendingTeamEvents();
  events.push({
    id,
    linkedById: true,
    result,
    recordCount: result === "win" ? state.record.wins : state.record.losses,
    stake: state.record.stake,
    createdAt: Date.now(),
    teamResult: teams,
  });
  savePendingTeamEvents(events);
  mapping.armed = false;
  localStorage.setItem(MIXER_STORAGE_KEY, JSON.stringify(mapping));
}

function revokeMixerAssignment(entry, recordCount) {
  if (!entry) return;
  const events = readPendingTeamEvents();
  const index = events.findLastIndex((event) =>
    event?.linkedById ? event.id === entry.id
      : event?.result === entry.result && Number(event?.recordCount) === recordCount
  );
  if (index < 0) return;
  const [removed] = events.splice(index, 1);
  savePendingTeamEvents(events);
  const mapping = readMixerMapping();
  if (!mapping || mapping.armed) return;
  mapping.confirmedResult = validMixerTeams(removed.teamResult);
  mapping.armed = true;
  localStorage.setItem(MIXER_STORAGE_KEY, JSON.stringify(mapping));
}

function clearMixerSessionTracking(clearLineup) {
  try {
    savePendingTeamEvents([]);
    const mapping = readMixerMapping();
    if (!mapping) return;
    mapping.armed = false;
    if (clearLineup) {
      mapping.result = [];
      mapping.confirmedResult = [];
    }
    localStorage.setItem(MIXER_STORAGE_KEY, JSON.stringify(mapping));
  } catch {
    // 팀 섞기 기록을 사용할 수 없어도 기본 전적 초기화는 계속 진행합니다.
  }
}

function clearCurrentSession({ clearLineup = false } = {}) {
  state.history = [];
  state.used.clear();
  state.record = { ...state.record, wins: 0, losses: 0 };
  state.matchState = { matches: [], pendingResults: [], pendingChampions: [], replacement: null };
  state.replacingMatchId = null;
  clearMixerSessionTracking(clearLineup);
  saveGameState();
  renderGameState();
}

function saveCurrentLandRecord() {
  const games = state.record.wins + state.record.losses;
  if (games === 0) return showToast("저장할 전적이 없습니다.");

  const mappedChampions = state.matchState.matches
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((match) => ({ id: match.championId, result: match.result }));
  const includedIds = new Set(mappedChampions.map((champion) => champion.id));
  const remainingChampions = [...state.used]
    .filter((id) => !includedIds.has(id))
    .map((id) => ({ id, result: null }));
  const records = readLandRecords();
  const balance = compactRecord ? getMixerSaveBalance() : "";
  const landRecord = {
    id: createMatchId(),
    createdAt: Date.now(),
    wins: state.record.wins,
    losses: state.record.losses,
    stake: state.record.stake,
    settlement: (state.record.wins - state.record.losses) * state.record.stake,
    champions: [...mappedChampions, ...remainingChampions],
    teamMatches: getCompletedTeamEvents(state.matchState),
    ...(balance ? { balance } : {}),
  };
  records.push(landRecord);

  try {
    localStorage.setItem(LAND_RECORDS_STORAGE_KEY, JSON.stringify(records));
    clearCurrentSession({ clearLineup: true });
    showToast("랜드 전적에 저장하고 현재 기록을 초기화했습니다.");
  } catch {
    showToast("브라우저 저장 공간을 확인해 주세요.");
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
  if (compactRecord) window.dispatchEvent(new Event("game-record-change"));
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
    const { id, result } = state.matchState.pendingResults.shift();
    const championId = state.matchState.pendingChampions.shift();
    const match = { id: id ?? createMatchId(), championId, result, stake: state.record.stake, createdAt: Date.now() };
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

function getOrderedMatches() {
  return [...state.matchState.matches].sort((a, b) => a.createdAt - b.createdAt);
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
    const wins = pendingResults.filter(({ result }) => result === "win").length;
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
  pendingResults.forEach(({ result }, index) => {
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
  getOrderedMatches()
    .map((match, index) => ({ match, number: index + 1 })).forEach(({ match, number }) => {
    const row = document.createElement("article");
    row.className = "match-record";
    const numberElement = document.createElement("span");
    numberElement.className = "match-record__number";
    numberElement.textContent = `${number}경기`;
    const resultElement = document.createElement("strong");
    resultElement.className = `match-record__result match-record__result--${match.result}`;
    resultElement.textContent = resultLabel(match.result);
    const championDetails = document.createElement("span");
    championDetails.className = "match-record__champion-details";
    const championElement = document.createElement("img");
    championElement.className = "match-record__champion";
    const champion = state.champions.find((item) => item.id === match.championId);
    championElement.src = `${DDRAGON_ROOT}/cdn/${state.version || FALLBACK_VERSION}/img/champion/${champion?.image.full ?? `${match.championId}.png`}`;
    championElement.alt = getChampionName(match.championId);
    championElement.title = getChampionName(match.championId);
    championElement.width = 44;
    championElement.height = 44;
    championElement.loading = "lazy";
    const championName = document.createElement("span");
    championName.className = "match-record__champion-name";
    championName.textContent = getChampionName(match.championId);
    championName.title = championName.textContent;
    championDetails.append(championElement, championName);
    const actions = document.createElement("div");
    actions.className = "match-record__actions";
    actions.append(
      createSmallButton("챔피언 변경", "change-champion", match.id),
      createSmallButton("삭제", "delete-match", match.id)
    );
    row.append(numberElement, resultElement, championDetails, actions);
    completedFragment.append(row);
  });
  if (!matches.length && !legacyCount) completedFragment.append(createEmptyMessage("아직 완료된 경기 기록이 없습니다."));
  ui.completedMatchList.replaceChildren(completedFragment);
}

function renderGameState() {
  if (compactRecord) {
    renderCompactRecord();
    return;
  }
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
  if (!compactRecord) {
    ui.loading.hidden = false;
    ui.error.hidden = true;
    ui.grid.hidden = true;
  }

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

    if (compactRecord) {
      renderGameState();
      return;
    }
    refreshStoredGameState();
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
    if (compactRecord) {
      compactRecord.querySelector("#mixerChampionRetry").hidden = false;
      return;
    }
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
      stake: Number.isFinite(replacement.stake) ? replacement.stake : state.record.stake,
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
        state.matchState.pendingResults.unshift(state.matchState.replacement);
      }
      state.matchState.replacement = {
        id: match.id,
        result: match.result,
        stake: Number.isFinite(match.stake) ? match.stake : state.record.stake,
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

function refreshStoredGameState() {
  state.used = new Set(readStoredUsed());
  state.record = readStoredRecord();
  state.matchState = readStoredMatchState();
}

function initCompactRecord() {
  const search = compactRecord.querySelector("#mixerChampionSearch");
  const results = compactRecord.querySelector("#mixerChampionResults");
  const usedList = compactRecord.querySelector("#mixerUsedChampions");
  const retry = compactRecord.querySelector("#mixerChampionRetry");
  const save = compactRecord.querySelector("#mixerRecordSave");
  const scoreButtons = compactRecord.querySelectorAll("[data-record]");
  const stakeButtons = compactRecord.querySelectorAll("[data-stake-delta]");
  const stakeTrigger = compactRecord.querySelector("#mixerStake");
  const stakeDialog = compactRecord.querySelector("#mixerStakeDialog");
  const stakeValue = compactRecord.querySelector("#mixerStakeValue");
  const settlementLabel = compactRecord.querySelector("#mixerSettlement");

  function renderSearch() {
    const query = normalizeSearchText(search.value);
    results.replaceChildren();
    results.hidden = !query;
    if (!query) return;

    const matches = state.champions.filter((champion) =>
      !state.used.has(champion.id) && matchesChampionSearch(champion, query)
    ).slice(0, 8);
    if (!matches.length) {
      results.textContent = state.champions.length
        ? "추가할 수 있는 챔피언이 없습니다."
        : "챔피언 목록을 불러오는 중입니다.";
      return;
    }
    for (const champion of matches) {
      const button = createSmallButton(champion.name, "add-champion", champion.id);
      button.className = "mixer-button mixer-button--secondary";
      results.append(button);
    }
  }

  renderCompactRecord = () => {
    const { wins, losses, stake } = state.record;
    const settlement = (wins - losses) * stake;
    compactRecord.querySelector("#mixerScore").textContent = `${wins}승 ${losses}패`;
    const formattedStake = `${stake.toLocaleString("ko-KR")}개`;
    stakeTrigger.textContent = `판당 별풍선 ${formattedStake}`;
    stakeValue.textContent = formattedStake;
    settlementLabel.textContent = `${settlement > 0 ? "+" : ""}${settlement.toLocaleString("ko-KR")}개`;
    settlementLabel.classList.toggle("is-positive", settlement > 0);
    settlementLabel.classList.toggle("is-negative", settlement < 0);
    const mapping = readMixerMapping();
    const teams = validMixerTeams(mapping?.confirmedResult);
    const hasHost = teams.flat().some(isMixerHost);
    const waitingForChampion = readPendingTeamEvents().some(({ id }) =>
      state.matchState.pendingResults.some((entry) => entry.id === id) || state.matchState.replacement?.id === id
    );
    compactRecord.querySelector("#mixerRecordHint").textContent = waitingForChampion
      ? "사용 챔피언을 선택하면 팀 전적에 반영됩니다."
      : mapping?.armed && hasHost
      ? "승패와 사용 챔피언을 입력하면 팀 전적에 반영됩니다."
      : "팀 전적에 반영하려면 경기마다 복사한 뒤 승패와 사용 챔피언을 입력하세요.";
    for (const button of scoreButtons) {
      const count = button.dataset.record === "win" ? wins : losses;
      button.disabled = button.dataset.delta === "-1" && count === 0;
    }
    for (const button of stakeButtons) {
      button.disabled = stake + Number(button.dataset.stakeDelta) < 0;
    }
    save.disabled = wins + losses === 0;

    const portraits = document.createDocumentFragment();
    const outcomes = new Map(state.matchState.matches.map(({ championId, result }) => [championId, result]));
    let matchedWins = 0;
    let matchedLosses = 0;
    for (const id of state.used) {
      const name = getChampionName(id);
      const button = createSmallButton("", "remove-champion", id);
      button.className = "mixer-record__portrait-button";
      button.setAttribute("aria-label", `${name} 사용 기록 취소`);
      button.title = `${name} 사용 기록 취소`;
      const portrait = document.createElement("img");
      const champion = state.champions.find((item) => item.id === id);
      const result = outcomes.get(id);
      if (result === "win") matchedWins += 1;
      if (result === "loss") matchedLosses += 1;
      portrait.className = result ? `history-champion history-champion--${result}` : "history-champion";
      portrait.src = `${DDRAGON_ROOT}/cdn/${state.version || FALLBACK_VERSION}/img/champion/${champion?.image.full ?? `${id}.png`}`;
      portrait.alt = name;
      portrait.width = 36;
      portrait.height = 36;
      button.append(portrait);
      portraits.append(button);
    }
    for (const [result, count] of [["win", wins - matchedWins], ["loss", losses - matchedLosses]]) {
      for (let index = 0; index < count; index += 1) {
        const slot = document.createElement("span");
        slot.className = `history-champion history-champion--${result} history-champion--unassigned`;
        slot.title = `${resultLabel(result)} · 챔피언 미선택`;
        slot.setAttribute("role", "img");
        slot.setAttribute("aria-label", slot.title);
        portraits.append(slot);
      }
    }
    usedList.hidden = !portraits.childElementCount;
    usedList.replaceChildren(portraits);
    renderSearch();
  };

  function addChampion(button) {
    if (!button || state.used.has(button.dataset.value)) return;
    search.value = "";
    toggleChampion(button.dataset.value);
    search.focus();
  }

  search.addEventListener("input", renderSearch);
  search.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter" && results.querySelector("button")) {
      event.preventDefault();
      addChampion(results.querySelector("button"));
    } else if (event.key === "Escape") {
      search.value = "";
      renderSearch();
    }
  });
  results.addEventListener("click", (event) => addChampion(event.target.closest("button")));
  usedList.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    toggleChampion(button.dataset.value);
    search.focus();
  });
  retry.addEventListener("click", () => {
    retry.hidden = true;
    loadChampions();
  });
  for (const button of scoreButtons) {
    button.addEventListener("click", () => changeRecord(button));
  }
  for (const button of stakeButtons) {
    button.addEventListener("click", () => changeStake(Number(button.dataset.stakeDelta)));
  }
  stakeTrigger.addEventListener("click", () => stakeDialog.showModal());
  save.addEventListener("click", saveCurrentLandRecord);
  window.addEventListener("mixer-reset", clearCurrentSession);
  window.addEventListener("mixer-lineup-change", renderCompactRecord);
  renderCompactRecord();
}

if (!compactRecord) {
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
  takeSnapshot();
  const returnedResults = state.matchState.matches.map(({ id, result }) => ({ id, result }));
  if (state.matchState.replacement) returnedResults.push(state.matchState.replacement);
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
}

function changeRecord(button) {
  const result = button.dataset.record;
  const key = result === "win" ? "wins" : "losses";
  const delta = Number(button.dataset.delta);
  state.history = [];
  if (delta > 0) {
    state.record[key] += 1;
    const entry = { id: createMatchId(), result };
    consumeMixerAssignment(entry);
    state.matchState.pendingResults.push(entry);
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
  let removedResult;
  let message = `${resultLabel(result)} 1회를 취소했습니다.`;
  if (state.matchState.replacement?.result === result) {
    removedResult = state.matchState.replacement;
    state.matchState.replacement = null;
  } else {
    const pendingIndex = state.matchState.pendingResults.findLastIndex((entry) => entry.result === result);
    if (pendingIndex >= 0) {
      [removedResult] = state.matchState.pendingResults.splice(pendingIndex, 1);
    } else {
      const matchIndex = state.matchState.matches.findLastIndex((match) => match.result === result);
      if (matchIndex >= 0) {
        const [removedMatch] = state.matchState.matches.splice(matchIndex, 1);
        removedResult = removedMatch;
        state.used.delete(removedMatch.championId);
        if (state.replacingMatchId === removedMatch.id) state.replacingMatchId = null;
        message = `${getChampionName(removedMatch.championId)}의 ${resultLabel(result)} 기록을 취소했습니다.`;
      }
    }
  }
  revokeMixerAssignment(removedResult, state.record[key]);
  state.record[key] -= 1;
  saveGameState();
  renderGameState();
  showToast(message);
}

function changeStake(delta) {
  state.record.stake = Math.max(0, state.record.stake + delta);
  saveRecord();
  const pendingTeamEvents = readPendingTeamEvents();
  if (pendingTeamEvents.length) {
    savePendingTeamEvents(pendingTeamEvents.map((event) => ({ ...event, stake: state.record.stake })));
    if (compactRecord) window.dispatchEvent(new Event("game-record-change"));
  }
  if (compactRecord) renderCompactRecord();
  else renderRecord();
}

if (!compactRecord) {
ui.recordControls.querySelectorAll("[data-record]").forEach((button) => {
  button.addEventListener("click", () => changeRecord(button));
});

ui.stakeControls.querySelectorAll("[data-stake-delta]").forEach((button) => {
  button.addEventListener("click", () => changeStake(Number(button.dataset.stakeDelta)));
});

ui.recordReset.addEventListener("click", () => {
  if (state.record.wins + state.record.losses === 0 && state.used.size === 0) {
    return showToast("초기화할 전적과 챔피언 기록이 없습니다.");
  }
  clearCurrentSession();
  showToast("전적과 챔피언 기록을 초기화했습니다.");
});

ui.recordSave.addEventListener("click", saveCurrentLandRecord);

function cancelChampionReplacement() {
  if (state.replacingMatchId) {
    state.replacingMatchId = null;
    renderMatchHistory();
    return showToast("챔피언 변경을 취소했습니다.");
  }
  if (!state.matchState.replacement) return;
  state.history = [];
  state.matchState.pendingResults.unshift(state.matchState.replacement);
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
  const width = Math.min(480, window.innerWidth - 24);
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
    const [entry] = state.matchState.pendingResults.splice(index, 1);
    if (!entry) return;
    const key = entry.result === "win" ? "wins" : "losses";
    revokeMixerAssignment(entry, state.record[key]);
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
    const gameNumber = getOrderedMatches().findIndex((item) => item.id === match.id) + 1;
    if (!window.confirm(`${gameNumber}경기의 기록을 삭제할까요?`)) return;
    state.history = [];
    state.matchState.matches.splice(matchIndex, 1);
    const key = match.result === "win" ? "wins" : "losses";
    revokeMixerAssignment(match, state.record[key]);
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
} else {
  initCompactRecord();
}

window.addEventListener("storage", (event) => {
  if ([null, STORAGE_KEY, RECORD_STORAGE_KEY, MATCH_STORAGE_KEY].includes(event.key)) {
    refreshStoredGameState();
    state.history = [];
    state.replacingMatchId = null;
    renderGameState();
  } else if (compactRecord && event.key === MIXER_STORAGE_KEY) {
    renderCompactRecord();
  }
});

loadChampions();
