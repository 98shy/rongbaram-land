const DDRAGON_ROOT = "https://ddragon.leagueoflegends.com";
const FALLBACK_VERSION = "16.18.1";
const LAND_RECORDS_STORAGE_KEY = "lol-champion-tracker:land-records-v1";

const ui = {
  list: document.querySelector("#historyList"),
  empty: document.querySelector("#historyEmpty"),
  balanceSummary: document.querySelector("#historyBalanceSummary"),
  updatedAt: document.querySelector("#historyUpdatedAt"),
  close: document.querySelector("#historyCloseButton"),
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

function writeLandRecords(records) {
  try {
    localStorage.setItem(LAND_RECORDS_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

function recordKey(record) {
  return `${String(record.id ?? "record")}:${String(record.createdAt)}`;
}

function displayDate(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return "날짜 미상";
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const period = date.getHours() < 12 ? "오전" : "오후";
  const hour = String(date.getHours() % 12 || 12).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdays[date.getDay()]})\n${period} ${hour}:${minute}`;
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

function getBalance(record) {
  if (typeof record.balance === "string") return record.balance;
  return typeof record.opponent === "string" ? record.opponent : "";
}

function createBalanceInput(value = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 40;
  input.placeholder = "밸런스를 입력하세요";
  input.value = value;
  input.setAttribute("aria-label", "밸런스 입력");
  return input;
}

function createBalanceText(value) {
  const balanceText = document.createElement("strong");
  balanceText.className = "history-balance__text";
  balanceText.textContent = value;
  return balanceText;
}

function renderLatestSavedAt(records) {
  const latestSavedAt = records.reduce((latest, record) => {
    const timestamp = Number(record.updatedAt ?? record.createdAt);
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  ui.updatedAt.textContent = latestSavedAt
    ? `최근 저장 ${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(latestSavedAt))}`
    : "최근 저장 기록 없음";
}

function renderBalanceSummary(records) {
  const groups = new Map();
  records.forEach((record) => {
    const balance = getBalance(record).trim() || "미입력";
    if (!groups.has(balance)) groups.set(balance, { balance, lands: 0, wins: 0, losses: 0, settlement: 0 });
    const group = groups.get(balance);
    const wins = Math.max(0, Number.parseInt(record.wins, 10) || 0);
    const losses = Math.max(0, Number.parseInt(record.losses, 10) || 0);
    const stake = Math.max(0, Number.parseInt(record.stake, 10) || 0);
    const storedSettlement = Number(record.settlement);
    group.lands += 1;
    group.wins += wins;
    group.losses += losses;
    group.settlement += Number.isFinite(storedSettlement) ? storedSettlement : (wins - losses) * stake;
  });

  const fragment = document.createDocumentFragment();
  [...groups.values()].sort((a, b) => {
    if (a.balance === "미입력") return 1;
    if (b.balance === "미입력") return -1;
    return a.balance.localeCompare(b.balance, "ko");
  }).forEach((group) => {
    const row = document.createElement("div");
    row.className = "history-summary__row";
    const balance = createTextValue(group.balance);
    const lands = createTextValue(`${group.lands}회`);
    const record = createTextValue(`${group.wins}승 ${group.losses}패`);
    const settlementClass = group.settlement > 0 ? "is-positive" : group.settlement < 0 ? "is-negative" : "";
    const settlement = createTextValue(formatSettlement(group.settlement), settlementClass);
    row.append(balance, lands, record, settlement);
    fragment.append(row);
  });

  if (!groups.size) {
    const empty = document.createElement("p");
    empty.className = "history-summary__empty";
    empty.textContent = "저장된 밸런스 전적이 없습니다.";
    fragment.append(empty);
  }
  ui.balanceSummary.replaceChildren(fragment);
}

function renderHistory() {
  const records = readLandRecords();
  const fragment = document.createDocumentFragment();

  records.slice().sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).forEach((record) => {
    const wins = Math.max(0, Number.parseInt(record.wins, 10) || 0);
    const losses = Math.max(0, Number.parseInt(record.losses, 10) || 0);
    const stake = Math.max(0, Number.parseInt(record.stake, 10) || 0);
    const storedSettlement = Number(record.settlement);
    const settlement = Number.isFinite(storedSettlement) ? storedSettlement : (wins - losses) * stake;
    const row = document.createElement("article");
    row.className = "history-row";
    row.dataset.recordId = recordKey(record);
    const champions = document.createElement("div");
    champions.className = "history-champions";

    normalizedChampions(record).forEach((savedChampion) => {
      const champion = championData.get(savedChampion.id);
      const image = document.createElement("img");
      image.src = `${DDRAGON_ROOT}/cdn/${ddragonVersion}/img/champion/${champion?.image.full ?? `${savedChampion.id}.png`}`;
      image.alt = champion?.name ?? savedChampion.id;
      image.title = champion?.name ?? savedChampion.id;
      image.width = 36;
      image.height = 36;
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

    const savedBalance = getBalance(record);
    const balanceField = document.createElement("div");
    balanceField.className = "history-balance";
    if (savedBalance) {
      balanceField.append(createBalanceText(savedBalance));
    } else {
      balanceField.append(createBalanceInput());
    }

    const actions = document.createElement("div");
    actions.className = "history-actions";
    const balanceButton = document.createElement("button");
    balanceButton.type = "button";
    balanceButton.className = "history-balance-action";
    balanceButton.dataset.action = savedBalance ? "edit-balance" : "save-balance";
    balanceButton.textContent = savedBalance ? "수정" : "저장";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "history-delete";
    deleteButton.dataset.action = "delete-record";
    deleteButton.textContent = "삭제";
    actions.append(balanceButton, deleteButton);

    row.append(
      createCell("날짜", createTextValue(displayDate(record.createdAt), "history-date")),
      createCell("밸런스", balanceField),
      createCell("승패 전적", createTextValue(`${wins}승 ${losses}패`, "history-record-score")),
      createCell("사용 챔피언", champions),
      createCell("최종 결산", createTextValue(formatSettlement(settlement), settlementClass)),
      createCell("관리", actions, "history-cell--actions")
    );
    fragment.append(row);
  });

  ui.list.replaceChildren(fragment);
  ui.empty.hidden = records.length !== 0;
  renderBalanceSummary(records);
  renderLatestSavedAt(records);
}

ui.list.addEventListener("input", (event) => {
  if (event.target.matches(".history-balance input")) event.target.setCustomValidity("");
});

ui.list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const row = button.closest(".history-row");
  const records = readLandRecords();
  const recordIndex = records.findIndex((record) => recordKey(record) === row?.dataset.recordId);
  if (recordIndex < 0) return;

  if (button.dataset.action === "save-balance") {
    const input = row.querySelector(".history-balance input");
    const balance = input.value.trim();
    if (!balance) {
      input.setCustomValidity("밸런스를 입력해 주세요.");
      input.reportValidity();
      return;
    }
    records[recordIndex].balance = balance;
    records[recordIndex].updatedAt = Date.now();
    delete records[recordIndex].opponent;
    if (!writeLandRecords(records)) return window.alert("브라우저 저장 공간을 확인해 주세요.");
    row.querySelector(".history-balance").replaceChildren(createBalanceText(balance));
    button.dataset.action = "edit-balance";
    button.textContent = "수정";
    renderBalanceSummary(records);
    renderLatestSavedAt(records);
    return;
  }

  if (button.dataset.action === "edit-balance") {
    const balanceField = row.querySelector(".history-balance");
    const input = createBalanceInput(getBalance(records[recordIndex]));
    balanceField.replaceChildren(input);
    button.dataset.action = "save-balance";
    button.textContent = "저장";
    input.focus();
    input.select();
    return;
  }

  if (button.dataset.action === "delete-record") {
    if (!window.confirm("이 전적 기록을 삭제할까요?")) return;
    records.splice(recordIndex, 1);
    if (!writeLandRecords(records)) return window.alert("브라우저 저장 공간을 확인해 주세요.");
    renderHistory();
  }
});

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

ui.close.addEventListener("click", () => {
  window.close();
  window.setTimeout(() => {
    if (!window.closed) window.location.href = "index.html";
  }, 120);
});

renderHistory();
loadChampionData().then(renderHistory);
