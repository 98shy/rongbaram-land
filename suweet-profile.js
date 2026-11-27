async function loadSuweetStats() {
  const endpoint = "https://api-channel.sooplive.com/v1.1/channel/suhee0051/station";

  try {
    const response = await fetch(endpoint, { cache: "no-cache" });
    if (!response.ok) return;

    const station = await response.json();
    const favorites = station?.upd?.fanCnt;
    const subscriptions = station?.subscription?.totalCnt;
    if (!Number.isSafeInteger(favorites) || favorites < 0 ||
        !Number.isSafeInteger(subscriptions) || subscriptions < 0) return;

    const numberFormat = new Intl.NumberFormat("ko-KR");
    document.getElementById("suweet-favorites").textContent = numberFormat.format(favorites);
    document.getElementById("suweet-subscriptions").textContent = numberFormat.format(subscriptions);
    document.getElementById("suweet-stats-source").textContent = "SOOP · 페이지를 열 때 갱신";
  } catch {
    // Keep the dated snapshot when SOOP is unavailable.
  }
}

loadSuweetStats();
