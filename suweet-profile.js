async function loadSoopStats() {
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
    const compactFormat = new Intl.NumberFormat("ko-KR", {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    document.getElementById("suweet-favorites").textContent = compactFormat.format(favorites);
    document.getElementById("suweet-subscriptions").textContent = numberFormat.format(subscriptions);
    document.getElementById("suweet-stats-source").textContent = "SOOP · 페이지를 열 때 갱신";
  } catch {
    // Keep the dated snapshot when SOOP is unavailable.
  }
}

async function loadYouTubeSubscribers() {
  const endpoint = "https://api.socialcounts.org/youtube-live-subscriber-count/UCZtzLAQmS8U_Yegn4XYYYkQ";

  try {
    const response = await fetch(endpoint, { cache: "no-cache" });
    if (!response.ok) return;

    const data = await response.json();
    const subscribers = data?.counters?.api?.subscriberCount;
    if (!Number.isSafeInteger(subscribers) || subscribers < 0) return;

    const compactFormat = new Intl.NumberFormat("ko-KR", {
      notation: "compact",
      maximumFractionDigits: 2,
    });
    const count = document.getElementById("suweet-youtube-subscribers");
    count.textContent = compactFormat.format(subscribers);
    count.title = "유튜브 공개 구독자 수 · SocialCounts";
  } catch {
    // Keep the dated snapshot when the public count is unavailable.
  }
}

loadSoopStats();
loadYouTubeSubscribers();
