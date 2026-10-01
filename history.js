const DDRAGON_ROOT = "https://ddragon.leagueoflegends.com";
const FALLBACK_VERSION = "16.18.1";
const LAND_RECORDS_STORAGE_KEY = "lol-champion-tracker:land-records-v1";

const ui = {
  list: document.querySelector("#historyList"),
  empty: document.querySelector("#historyEmpty"),
  totalGames: document.querySelector("#historyTotalGames"),
  totalRecord: document.querySelector("#historyTotalRecord"),
  totalSettlement: document.querySelector("#historyTotalSettlement"),
  updatedAt: document.querySelector("#historyUpdatedAt"),
};

let ddragonVersion = FALLBACK_VERSION;
let championData = new Map();

function readLandRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAND_RECORDS_STORAGE_KEY));
    if (!Array.isArray(saved)) return [];
    return saved.filter((record) => record && Number.isFinite(Number(record.createdAt)));
  } catch {
    return [];
  }
}

function displayDate(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return "날짜 미상";
  const day = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${day} · ${time}`;
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

function normalizedChampions(record) {
  const champions = Array.isArray(record.champions) ? record.champions : [];
  return champions.map((champion) => typeof champion === "string"
    ? { id: champion, result: null }
    : champion
  ).filter((champion) => champion?.id);
}

function renderHistory() {
  const records = readLandRecords();
  let totalGames = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalSettlement = 0;
  const fragment = document.createDocumentFragment();

  records.slice().sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).forEach((record) => {
    const wins = Math.max(0, Number.parseInt(record.wins, 10) || 0);
    const losses = Math.max(0, Number.parseInt(record.losses, 10) || 0);
    const stake = Math.max(0, Number.parseInt(record.stake, 10) || 0);
    const storedSettlement = Number(record.settlement);
    const settlement = Number.isFinite(storedSettlement) ? storedSettlement : (wins - losses) * stake;
    totalGames += wins + losses;
    totalWins += wins;
    totalLosses += losses;
    totalSettlement += settlement;

    const row = document.createElement("article");
    row.className = "history-row";
    const champions = document.createElement("div");
    champions.className = "history-champions";

    normalizedChampions(record).forEach((savedChampion) => {
      const champion = championData.get(savedChampion.id);
      const image = document.createElement("img");
      image.src = `${DDRAGON_ROOT}/cdn/${ddragonVersion}/img/champion/${champion?.image.full ?? `${savedChampion.id}.png`}`;
      image.alt = champion?.name ?? savedChampion.id;
      image.title = champion?.name ?? savedChampion.id;
      image.width = 44;
      image.height = 44;
      image.loading = "lazy";
      const resultClass = savedChampion.result === "win" || savedChampion.result === "loss"
        ? ` history-champion--${savedChampion.result}`
        : "";
      image.className = `history-champion${resultClass}`;
      champions.append(image);
    });

    if (!champions.childElementCount) {
      const emptyChampions = document.createElement("span");
      emptyChampions.className = "history-champions__empty";
      emptyChampions.textContent = "저장된 챔피언 없음";
      champions.append(emptyChampions);
    }

    const settlementClass = settlement > 0
      ? "history-settlement is-positive"
      : settlement < 0 ? "history-settlement is-negative" : "history-settlement";
    row.append(
      createCell("날짜", createTextValue(displayDate(record.createdAt))),
      createCell("승패 전적", createTextValue(`${wins}승 ${losses}패`)),
      createCell("사용 챔피언", champions),
      createCell("최종 결산", createTextValue(formatSettlement(settlement), settlementClass))
    );
    fragment.append(row);
  });

  ui.list.replaceChildren(fragment);
  ui.empty.hidden = records.length !== 0;
  ui.totalGames.textContent = `${totalGames.toLocaleString("ko-KR")}경기`;
  ui.totalRecord.textContent = `${totalWins}승 ${totalLosses}패`;
  ui.totalSettlement.textContent = formatSettlement(totalSettlement);
  ui.totalSettlement.classList.toggle("is-positive", totalSettlement > 0);
  ui.totalSettlement.classList.toggle("is-negative", totalSettlement < 0);
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
    // 네트워크가 끊겨도 저장된 챔피언 ID를 사용해 기록을 표시합니다.
  }
}

window.addEventListener("storage", (event) => {
  if (event.key === LAND_RECORDS_STORAGE_KEY) renderHistory();
});

renderHistory();
loadChampionData().then(renderHistory);
