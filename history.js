const DDRAGON_ROOT = "https://ddragon.leagueoflegends.com";
const FALLBACK_VERSION = "16.18.1";
const MATCH_STORAGE_KEY = "lol-champion-tracker:matches-v1";
const RECORD_STORAGE_KEY = "lol-champion-tracker:record-v1";

const ui = {
  list: document.querySelector("#historyList"),
  empty: document.querySelector("#historyEmpty"),
  legacy: document.querySelector("#historyLegacyNotice"),
  totalGames: document.querySelector("#historyTotalGames"),
  totalRecord: document.querySelector("#historyTotalRecord"),
  totalSettlement: document.querySelector("#historyTotalSettlement"),
  updatedAt: document.querySelector("#historyUpdatedAt"),
};

let ddragonVersion = FALLBACK_VERSION;
let championData = new Map();

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function readHistoryData() {
  const matchState = readJSON(MATCH_STORAGE_KEY, {});
  const record = readJSON(RECORD_STORAGE_KEY, {});
  const matches = Array.isArray(matchState.matches)
    ? matchState.matches.filter((match) => match?.championId && (match.result === "win" || match.result === "loss"))
    : [];
  return {
    matches,
    record: {
      wins: Math.max(0, Number.parseInt(record.wins, 10) || 0),
      losses: Math.max(0, Number.parseInt(record.losses, 10) || 0),
      stake: Math.max(0, Number.parseInt(record.stake, 10) || 0),
    },
  };
}

function dateKey(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return "unknown";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(key) {
  if (key === "unknown") return "날짜 미상";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

function formatSettlement(value) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("ko-KR")}개`;
}

function createCell(label, content, className = "") {
  const cell = document.createElement("div");
  cell.className = `history-cell ${className}`.trim();
  const labelElement = document.createElement("span");
  labelElement.className = "history-cell__label";
  labelElement.textContent = label;
  cell.append(labelElement, content);
  return cell;
}

function createTextValue(text, className = "") {
  const value = document.createElement("strong");
  value.className = className;
  value.textContent = text;
  return value;
}

function renderHistory() {
  const { matches, record } = readHistoryData();
  const groups = new Map();
  let totalWins = 0;
  let totalLosses = 0;
  let totalSettlement = 0;

  matches.forEach((match) => {
    const key = dateKey(match.createdAt);
    if (!groups.has(key)) groups.set(key, { key, wins: 0, losses: 0, settlement: 0, matches: [] });
    const group = groups.get(key);
    const stake = Number.isFinite(Number(match.stake)) ? Math.max(0, Number(match.stake)) : record.stake;
    group.matches.push(match);
    if (match.result === "win") {
      group.wins += 1;
      group.settlement += stake;
      totalWins += 1;
      totalSettlement += stake;
    } else {
      group.losses += 1;
      group.settlement -= stake;
      totalLosses += 1;
      totalSettlement -= stake;
    }
  });

  const fragment = document.createDocumentFragment();
  [...groups.values()].sort((a, b) => {
    if (a.key === "unknown") return 1;
    if (b.key === "unknown") return -1;
    return b.key.localeCompare(a.key);
  }).forEach((group) => {
    const row = document.createElement("article");
    row.className = "history-row";

    const champions = document.createElement("div");
    champions.className = "history-champions";
    group.matches.sort((a, b) => Number(a.createdAt) - Number(b.createdAt)).forEach((match) => {
      const champion = championData.get(match.championId);
      const image = document.createElement("img");
      image.src = `${DDRAGON_ROOT}/cdn/${ddragonVersion}/img/champion/${champion?.image.full ?? `${match.championId}.png`}`;
      image.alt = champion?.name ?? match.championId;
      image.title = `${champion?.name ?? match.championId} · ${match.result === "win" ? "승리" : "패배"}`;
      image.width = 44;
      image.height = 44;
      image.loading = "lazy";
      image.className = `history-champion history-champion--${match.result}`;
      champions.append(image);
    });

    const settlementClass = group.settlement > 0
      ? "history-settlement is-positive"
      : group.settlement < 0 ? "history-settlement is-negative" : "history-settlement";
    row.append(
      createCell("날짜", createTextValue(displayDate(group.key))),
      createCell("승패 전적", createTextValue(`${group.wins}승 ${group.losses}패`)),
      createCell("사용 챔피언", champions),
      createCell("최종 결산", createTextValue(formatSettlement(group.settlement), settlementClass))
    );
    fragment.append(row);
  });

  ui.list.replaceChildren(fragment);
  ui.empty.hidden = matches.length !== 0;
  ui.totalGames.textContent = `${matches.length.toLocaleString("ko-KR")}경기`;
  ui.totalRecord.textContent = `${totalWins}승 ${totalLosses}패`;
  ui.totalSettlement.textContent = formatSettlement(totalSettlement);
  ui.totalSettlement.classList.toggle("is-positive", totalSettlement > 0);
  ui.totalSettlement.classList.toggle("is-negative", totalSettlement < 0);
  const legacyCount = Math.max(0, record.wins + record.losses - matches.length);
  ui.legacy.hidden = legacyCount === 0;
  ui.legacy.textContent = legacyCount
    ? `자동 매핑 기능 적용 전의 ${legacyCount}경기는 날짜와 챔피언 정보가 없어 위 목록에서 제외됩니다.`
    : "";
  ui.updatedAt.textContent = `최근 확인 ${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
}

async function loadChampionData() {
  try {
    const versionsResponse = await fetch(`${DDRAGON_ROOT}/api/versions.json`);
    if (versionsResponse.ok) {
      const versions = await versionsResponse.json();
      if (versions[0]) ddragonVersion = versions[0];
    }
    const championsResponse = await fetch(`${DDRAGON_ROOT}/cdn/${ddragonVersion}/data/ko_KR/champion.json`);
    if (!championsResponse.ok) return;
    const payload = await championsResponse.json();
    championData = new Map(Object.values(payload.data).map((champion) => [champion.id, champion]));
  } catch {
    // 네트워크가 끊겨도 저장된 ID를 사용해 기록을 계속 표시합니다.
  }
}

window.addEventListener("storage", (event) => {
  if (event.key === MATCH_STORAGE_KEY || event.key === RECORD_STORAGE_KEY) renderHistory();
});

renderHistory();
loadChampionData().then(renderHistory);
