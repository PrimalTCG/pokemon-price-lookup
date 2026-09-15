const POKEMONTCG_BASE = "https://api.pokemontcg.io/v2/cards";
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

const CONDITIONS = [
  { label: "Near Mint (100%)", pct: 100, code: "NM" },
  { label: "Lightly Played (~85%)", pct: 85, code: "LP" },
  { label: "Moderately Played (~65%)", pct: 65, code: "MP" },
  { label: "Heavily Played (~40%)", pct: 40, code: "HP" },
  { label: "Damaged (~20%)", pct: 20, code: "DMG" },
];

const GRADING_COMPANIES = {
  PSA: { label: "PSA", grades: ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"] },
  BGS: { label: "Beckett (BGS)", grades: ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6", "5", "4"] },
  CGC: { label: "CGC", grades: ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6", "5", "4"] },
  TAG: { label: "TAG", grades: ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6", "5", "4"] },
};

const store = {
  getApiKey: () => localStorage.getItem("pfp_apiKey") || "",
  setApiKey: (v) => localStorage.setItem("pfp_apiKey", v),
  getConditionDefault: () => Number(localStorage.getItem("pfp_conditionDefault")) || 100,
  setConditionDefault: (v) => localStorage.setItem("pfp_conditionDefault", String(v)),
  getHistory: () => JSON.parse(localStorage.getItem("pfp_history") || "[]"),
  setHistory: (arr) => localStorage.setItem("pfp_history", JSON.stringify(arr)),
  getComps: () => JSON.parse(localStorage.getItem("pfp_comps") || "{}"),
  setComps: (obj) => localStorage.setItem("pfp_comps", JSON.stringify(obj)),
  getSearchCache: () => JSON.parse(localStorage.getItem("pfp_searchCache") || "{}"),
  setSearchCache: (obj) => localStorage.setItem("pfp_searchCache", JSON.stringify(obj)),
  getSearchFrequency: () => JSON.parse(localStorage.getItem("pfp_searchFreq") || "{}"),
  setSearchFrequency: (obj) => localStorage.setItem("pfp_searchFreq", JSON.stringify(obj)),
};

const el = {
  searchInput: document.getElementById("search-input"),
  cameraBtn: document.getElementById("camera-btn"),
  cameraInput: document.getElementById("camera-input"),
  ocrStatus: document.getElementById("ocr-status"),
  searchStatus: document.getElementById("search-status"),
  resultsList: document.getElementById("results-list"),
  recentSection: document.getElementById("recent-section"),
  recentList: document.getElementById("recent-list"),
  searchView: document.getElementById("search-view"),
  detailView: document.getElementById("detail-view"),
  detailContent: document.getElementById("detail-content"),
  backBtn: document.getElementById("back-btn"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsView: document.getElementById("settings-view"),
  apiKeyInput: document.getElementById("api-key-input"),
  conditionDefault: document.getElementById("condition-default"),
  saveSettingsBtn: document.getElementById("save-settings-btn"),
  clearHistoryBtn: document.getElementById("clear-history-btn"),
  sideLeft: document.getElementById("side-left"),
  sideRight: document.getElementById("side-right"),
  watchlistList: document.getElementById("watchlist-list"),
  watchlistStatus: document.getElementById("watchlist-status"),
  mostCheckedList: document.getElementById("most-checked-list"),
  newReleasesList: document.getElementById("new-releases-list"),
};

let state = {
  currentCard: null,
  currentVariant: null,
  currentConditionPct: store.getConditionDefault(),
  priceMode: "raw",
  gradedCompany: "PSA",
  gradedGrade: "10",
};

function parseApiDate(str) {
  if (!str) return null;
  const d = new Date(str.replace(/\//g, "-"));
  return isNaN(d.getTime()) ? null : d;
}

function daysSince(str) {
  const d = parseApiDate(str);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function formatDaysAgo(days) {
  if (days == null) return "unknown date";
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatMoney(n) {
  if (n == null || isNaN(n)) return "—";
  return "$" + Number(n).toFixed(2);
}

function buildTcgplayerSearchUrl(card) {
  const cardNumber = card.number ? (card.set?.printedTotal ? `${card.number}/${card.set.printedTotal}` : card.number) : null;
  const terms = [card.name, card.set?.name, cardNumber].filter(Boolean);
  const params = new URLSearchParams({ q: terms.join(" ") });
  return `https://www.tcgplayer.com/search/pokemon/product?${params.toString()}`;
}

function buildEbaySoldSearchUrl(card, extraTerms) {
  const year = card.set?.releaseDate ? card.set.releaseDate.slice(0, 4) : null;
  const cardNumber = card.number ? (card.set?.printedTotal ? `${card.number}/${card.set.printedTotal}` : card.number) : null;
  const terms = [year, "Pokemon", card.name, card.set?.name, cardNumber, ...extraTerms].filter(Boolean);
  const params = new URLSearchParams({
    _nkw: terms.join(" "),
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "13",
  });
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

async function fetchJson(url, { headers = {}, timeoutMs = 9000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonRetry(url, opts, retries = 1) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchJson(url, opts);
    } catch (err) {
      lastErr = err;
      const isClientError = err.status && err.status >= 400 && err.status < 500 && err.status !== 429;
      if (isClientError || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  throw lastErr;
}

async function trySource(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err };
  }
}

async function searchPokemonTcgIo(term) {
  const headers = {};
  const key = store.getApiKey();
  if (key) headers["X-Api-Key"] = key;
  const q = encodeURIComponent(`name:${term}*`);
  const data = await fetchJsonRetry(`${POKEMONTCG_BASE}?q=${q}&pageSize=25&orderBy=-set.releaseDate`, { headers }, 1);
  return (data.data || []).map((card) => ({ ...card, _source: "pokemontcg.io" }));
}

function kebabToCamel(str) {
  return str.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function normalizeTcgdexCard(card) {
  const tcgPrices = {};
  let tcgUpdated = null;
  let cm = null;
  for (const variant of card.variants_detailed || []) {
    const p = variant.pricing;
    if (!p) continue;
    if (p.tcgplayer) {
      tcgUpdated = tcgUpdated || p.tcgplayer.updated;
      for (const [key, v] of Object.entries(p.tcgplayer)) {
        if (key === "unit" || key === "updated" || !v || typeof v !== "object") continue;
        const camelKey = kebabToCamel(key);
        if (!tcgPrices[camelKey]) {
          tcgPrices[camelKey] = { low: v.lowPrice, mid: v.midPrice, high: v.highPrice, market: v.marketPrice, directLow: v.directLowPrice };
        }
      }
    }
    if (p.cardmarket && !cm) cm = p.cardmarket;
  }

  const cardmarket = cm
    ? {
        updatedAt: cm.updated,
        prices: {
          trendPrice: cm.trend,
          averageSellPrice: cm.avg,
          avg1: cm.avg1,
          avg7: cm.avg7,
          avg30: cm.avg30,
          lowPrice: cm.low,
          reverseHoloTrend: cm["trend-holo"],
          reverseHoloAvg1: cm["avg1-holo"],
          reverseHoloAvg7: cm["avg7-holo"],
          reverseHoloAvg30: cm["avg30-holo"],
        },
      }
    : undefined;

  return {
    id: card.id,
    name: card.name,
    number: card.localId,
    rarity: card.rarity,
    images: card.image ? { small: `${card.image}/low.webp`, large: `${card.image}/high.webp` } : {},
    set: card.set ? { name: card.set.name, printedTotal: card.set.cardCount?.official || card.set.cardCount?.total } : undefined,
    tcgplayer: Object.keys(tcgPrices).length ? { updatedAt: tcgUpdated, prices: tcgPrices } : undefined,
    cardmarket,
    _source: "TCGdex (backup)",
  };
}

async function searchTcgdex(term) {
  const list = await fetchJsonRetry(`${TCGDEX_BASE}/cards?name=${encodeURIComponent(term)}`, {}, 1);
  const subset = list.slice(0, 12);
  const details = await Promise.all(
    subset.map(async (c) => {
      const result = await trySource(() => fetchJsonRetry(`${TCGDEX_BASE}/cards/${c.id}`, {}, 0));
      return result.ok ? normalizeTcgdexCard(result.value) : null;
    })
  );
  return details.filter(Boolean);
}

function hasTcgplayerPricing(card) {
  return !!(card.tcgplayer?.prices && Object.keys(card.tcgplayer.prices).length);
}

function hasCardmarketPricing(card) {
  return !!(card.cardmarket?.prices && Object.values(card.cardmarket.prices).some((v) => typeof v === "number" && v > 0));
}

function cardNeedsEnrichment(card) {
  return !hasTcgplayerPricing(card) || !hasCardmarketPricing(card);
}

async function fetchPokemonTcgIoById(id) {
  const headers = {};
  const key = store.getApiKey();
  if (key) headers["X-Api-Key"] = key;
  const data = await fetchJsonRetry(`${POKEMONTCG_BASE}/${id}`, { headers }, 0);
  return { ...data.data, _source: "pokemontcg.io" };
}

async function fetchTcgdexById(id) {
  const data = await fetchJsonRetry(`${TCGDEX_BASE}/cards/${id}`, {}, 0);
  return normalizeTcgdexCard(data);
}

async function enrichCardPricing(card) {
  if (!cardNeedsEnrichment(card)) return card;
  const fetchOther = card._source === "TCGdex (backup)" ? fetchPokemonTcgIoById : fetchTcgdexById;
  const result = await trySource(() => fetchOther(card.id));
  if (!result.ok) return card;
  const other = result.value;
  const merged = { ...card, _crossReferenced: card._crossReferenced || [] };
  if (!hasTcgplayerPricing(card) && hasTcgplayerPricing(other)) {
    merged.tcgplayer = other.tcgplayer;
    merged._crossReferenced = [...merged._crossReferenced, "TCGplayer"];
  }
  if (!hasCardmarketPricing(card) && hasCardmarketPricing(other)) {
    merged.cardmarket = other.cardmarket;
    merged._crossReferenced = [...merged._crossReferenced, "Cardmarket"];
  }
  return merged;
}

function cacheSearchResults(term, cards) {
  const cache = store.getSearchCache();
  cache[term.toLowerCase()] = { cards, ts: new Date().toISOString() };
  const keys = Object.keys(cache);
  if (keys.length > 40) delete cache[keys[0]];
  store.setSearchCache(cache);
}

function handleTotalSearchFailure(term, primaryError) {
  const cached = store.getSearchCache()[term.toLowerCase()];
  if (cached) {
    renderResults(cached.cards);
    el.searchStatus.textContent = `Both price sources are unreachable — showing cached results from ${formatDaysAgo(daysSince(cached.ts))}.`;
    return;
  }
  const hint = primaryError?.status === 429 ? " Add a free API key in Settings to reduce rate limits." : "";
  el.searchStatus.textContent = `Both price sources are unavailable right now — try again shortly.${hint}`;
}

let searchTimer = null;
el.searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const term = el.searchInput.value.trim();
  if (!term) {
    el.resultsList.innerHTML = "";
    el.searchStatus.textContent = "";
    renderRecent();
    return;
  }
  searchTimer = setTimeout(() => runSearch(term), 350);
});

async function runSearch(term) {
  el.searchStatus.textContent = "Searching…";
  el.resultsList.innerHTML = "";

  const primary = await trySource(() => searchPokemonTcgIo(term));
  let cards = primary.ok ? primary.value : null;
  let usedFallback = false;

  if (cards === null || cards.length === 0) {
    const fallback = await trySource(() => searchTcgdex(term));
    if (fallback.ok && fallback.value.length) {
      cards = fallback.value;
      usedFallback = true;
    } else if (cards === null && !fallback.ok) {
      handleTotalSearchFailure(term, primary.error);
      return;
    } else if (cards === null) {
      cards = [];
    }
  }

  if (cards.length === 0) {
    el.searchStatus.textContent = "No cards found. Try a shorter or different spelling.";
    return;
  }

  el.searchStatus.textContent = usedFallback
    ? `${cards.length} result${cards.length === 1 ? "" : "s"} — backup source (pokemontcg.io unavailable)`
    : `${cards.length} result${cards.length === 1 ? "" : "s"}`;
  renderResults(cards);

  const needEnrichment = cards.some(cardNeedsEnrichment);
  if (needEnrichment) {
    cards = await Promise.all(cards.map(enrichCardPricing));
    renderResults(cards);
  }
  cacheSearchResults(term, cards);
}

function bestGlanceHighlights(card) {
  const tcg = card.tcgplayer?.prices;
  if (tcg) {
    const variant = tcg.holofoil || tcg.normal || tcg.reverseHolofoil || Object.values(tcg)[0];
    if (variant?.market) return formatMoney(variant.market);
  }
  if (card.cardmarket?.prices?.trendPrice) return formatMoney(card.cardmarket.prices.trendPrice);
  return "no data";
}

function renderResults(cards) {
  el.resultsList.innerHTML = "";
  for (const card of cards) {
    const li = document.createElement("li");
    li.className = "result-item";
    li.innerHTML = `
      <img src="${card.images?.small || ""}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
      <div>
        <div class="rname">${card.name}</div>
        <div class="rmeta">${card.set?.name || ""} · #${card.number}${card.set?.printedTotal ? "/" + card.set.printedTotal : ""} · ${card.rarity || "—"}</div>
      </div>
      <div class="result-price">${bestGlanceHighlights(card)}</div>
    `;
    li.addEventListener("click", () => openDetail(card));
    el.resultsList.appendChild(li);
  }
}

function renderRecent() {
  const history = store.getHistory();
  if (history.length === 0) {
    el.recentSection.hidden = true;
    return;
  }
  el.recentSection.hidden = false;
  el.recentList.innerHTML = "";
  for (const item of history) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<img src="${item.images?.small || ""}" alt="" onerror="this.style.visibility='hidden'" /><span>${item.name}</span>`;
    chip.addEventListener("click", () => openDetail(item));
    el.recentList.appendChild(chip);
  }
}

const WATCHLIST_NAMES = [
  "Charizard", "Blastoise", "Venusaur", "Umbreon VMAX", "Rayquaza VMAX",
  "Giratina V", "Mew ex", "Lugia", "Gengar VMAX", "Sylveon VMAX",
  "Gyarados", "Mewtwo", "Moltres", "Pikachu",
];
const WATCHLIST_CACHE_KEY = "pfp_watchlistCache";
const NEW_RELEASES_CACHE_KEY = "pfp_newReleasesCache";
const SIDE_CACHE_HOURS = 12;

function sideCardHtml(card, extraLine) {
  return `
    <li class="side-card">
      <img src="${card.images?.small || ""}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="side-card-info">
        <div class="side-card-name">${card.name}</div>
        <div class="side-card-set">${card.set?.name || ""}</div>
        ${extraLine || ""}
      </div>
    </li>
  `;
}

function wireSideCardClicks(listEl, cards) {
  listEl.querySelectorAll(".side-card").forEach((li, i) => {
    li.addEventListener("click", () => openDetail(cards[i]));
  });
}

function pickBestPrintFromResults(cards) {
  let best = null;
  let bestPrice = -1;
  for (const card of cards) {
    const prices = card.tcgplayer?.prices;
    if (!prices) continue;
    for (const variant of Object.values(prices)) {
      if (typeof variant.market === "number" && variant.market > bestPrice) {
        bestPrice = variant.market;
        best = card;
      }
    }
  }
  return best;
}

async function fetchWatchlistCard(name) {
  // Deliberately lightweight: a single, short-timeout, no-retry, no-fallback,
  // no-enrichment fetch per name. This runs ~14 of these concurrently on page
  // load, so any cascading (retries/fallback/enrichment) multiplies fast and
  // can bog the page down when the API is degraded. A skipped watchlist entry
  // is harmless; a slow page isn't.
  const headers = {};
  const key = store.getApiKey();
  if (key) headers["X-Api-Key"] = key;
  const q = encodeURIComponent(`name:${name}*`);
  const result = await trySource(() =>
    fetchJson(`${POKEMONTCG_BASE}?q=${q}&pageSize=10&orderBy=-set.releaseDate`, { headers, timeoutMs: 6000 })
  );
  if (!result.ok) return null;
  const cards = (result.value.data || []).map((c) => ({ ...c, _source: "pokemontcg.io" }));
  return pickBestPrintFromResults(cards);
}

function computeCardMovement(card) {
  const cm = card.cardmarket?.prices;
  if (!cm || typeof cm.avg7 !== "number" || typeof cm.avg30 !== "number" || cm.avg30 <= 0) return null;
  return { pct: ((cm.avg7 - cm.avg30) / cm.avg30) * 100 };
}

function renderWatchlist(cards) {
  const withMovement = cards
    .map((card) => ({ card, movement: computeCardMovement(card) }))
    .filter((x) => x.movement);
  if (withMovement.length === 0) {
    el.watchlistStatus.textContent = "No 30-day trend data available right now.";
    el.watchlistList.innerHTML = "";
    return;
  }
  withMovement.sort((a, b) => Math.abs(b.movement.pct) - Math.abs(a.movement.pct));
  el.watchlistStatus.textContent = "";
  el.watchlistList.innerHTML = withMovement
    .map(({ card, movement }) => {
      const dir = movement.pct >= 0 ? "up" : "down";
      const arrow = movement.pct >= 0 ? "▲" : "▼";
      return sideCardHtml(card, `<div class="side-card-move ${dir}">${arrow} ${Math.abs(movement.pct).toFixed(1)}% vs 30d avg</div>`);
    })
    .join("");
  wireSideCardClicks(el.watchlistList, withMovement.map((x) => x.card));
}

async function loadWatchlist() {
  if (!el.watchlistList) return;
  const cached = JSON.parse(localStorage.getItem(WATCHLIST_CACHE_KEY) || "null");
  if (cached && Date.now() - cached.ts < SIDE_CACHE_HOURS * 3600000) {
    renderWatchlist(cached.cards);
    return;
  }
  el.watchlistStatus.textContent = "Loading…";
  const results = await Promise.all(WATCHLIST_NAMES.map((name) => trySource(() => fetchWatchlistCard(name))));
  const cards = results.filter((r) => r.ok && r.value).map((r) => r.value);
  if (cards.length) {
    localStorage.setItem(WATCHLIST_CACHE_KEY, JSON.stringify({ cards, ts: Date.now() }));
    renderWatchlist(cards);
  } else {
    el.watchlistStatus.textContent = "Unable to load right now.";
  }
}

function renderMostChecked() {
  if (!el.mostCheckedList) return;
  const freq = store.getSearchFrequency();
  const entries = Object.values(freq)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  if (entries.length === 0) {
    el.mostCheckedList.innerHTML = `<div class="side-empty">Cards you look up will show here.</div>`;
    return;
  }
  el.mostCheckedList.innerHTML = entries
    .map(({ card, count }) => sideCardHtml(card, `<div class="side-card-set">Checked ${count}×</div>`))
    .join("");
  wireSideCardClicks(el.mostCheckedList, entries.map((e) => e.card));
}

function renderNewReleases(cards) {
  el.newReleasesList.innerHTML = cards.map((card) => sideCardHtml(card)).join("");
  wireSideCardClicks(el.newReleasesList, cards);
}

async function loadNewReleases() {
  if (!el.newReleasesList) return;
  const cached = JSON.parse(localStorage.getItem(NEW_RELEASES_CACHE_KEY) || "null");
  if (cached && Date.now() - cached.ts < SIDE_CACHE_HOURS * 3600000) {
    renderNewReleases(cached.cards);
    return;
  }
  const q = encodeURIComponent("supertype:Pokémon");
  const result = await trySource(() => fetchJsonRetry(`${POKEMONTCG_BASE}?q=${q}&orderBy=-set.releaseDate&pageSize=6`, {}, 1));
  if (result.ok) {
    const cards = (result.value.data || []).map((c) => ({ ...c, _source: "pokemontcg.io" }));
    localStorage.setItem(NEW_RELEASES_CACHE_KEY, JSON.stringify({ cards, ts: Date.now() }));
    renderNewReleases(cards);
  } else {
    el.newReleasesList.innerHTML = `<div class="side-empty">Unable to load right now.</div>`;
  }
}

function pushHistory(card) {
  let history = store.getHistory().filter((c) => c.id !== card.id);
  history.unshift(card);
  history = history.slice(0, 20);
  store.setHistory(history);

  const freq = store.getSearchFrequency();
  const existing = freq[card.id];
  freq[card.id] = { card, count: (existing?.count || 0) + 1 };
  store.setSearchFrequency(freq);
  renderMostChecked();
}

function setHomeVisible(visible) {
  el.searchView.hidden = !visible;
  el.sideLeft.hidden = !visible;
  el.sideRight.hidden = !visible;
}

async function openDetail(card) {
  state.currentCard = card;
  state.priceMode = "raw";
  state.gradedCompany = "PSA";
  state.gradedGrade = "10";
  const variants = Object.keys(card.tcgplayer?.prices || {});
  state.currentVariant = variants[0] || null;
  state.currentConditionPct = store.getConditionDefault();
  pushHistory(card);
  setHomeVisible(false);
  el.settingsView.hidden = true;
  el.detailView.hidden = false;
  renderDetail();

  if (cardNeedsEnrichment(card)) {
    const enriched = await enrichCardPricing(card);
    if (state.currentCard === card) {
      state.currentCard = enriched;
      if (!state.currentVariant) {
        const enrichedVariants = Object.keys(enriched.tcgplayer?.prices || {});
        state.currentVariant = enrichedVariants[0] || null;
      }
      pushHistory(enriched);
      renderDetail();
    }
  }
}

el.backBtn.addEventListener("click", () => {
  el.detailView.hidden = true;
  setHomeVisible(true);
  renderRecent();
});

function variantLabel(key) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^1st/i, "1st")
    .trim();
}

function computeDataPoints(card, variant, comps) {
  const points = [];
  const tcg = card.tcgplayer;
  if (tcg?.prices?.[variant]) {
    const days = daysSince(tcg.updatedAt);
    const p = tcg.prices[variant];
    const fields = [
      ["market", 3],
      ["mid", 1],
      ["low", 1],
      ["high", 1],
    ];
    for (const [key, weight] of fields) {
      if (typeof p[key] === "number") {
        points.push({ label: `TCGplayer ${key}`, value: p[key], days, weight });
      }
    }
  }
  const cm = card.cardmarket;
  if (cm?.prices) {
    const days = daysSince(cm.updatedAt);
    const isReverse = variant === "reverseHolofoil";
    const fields = isReverse
      ? [
          ["reverseHoloTrend", "Cardmarket reverse holo trend", 3],
          ["reverseHoloAvg30", "Cardmarket reverse holo 30d avg", 2],
          ["reverseHoloAvg7", "Cardmarket reverse holo 7d avg", 1],
          ["reverseHoloAvg1", "Cardmarket reverse holo 1d avg", 1],
        ]
      : [
          ["trendPrice", "Cardmarket trend", 3],
          ["averageSellPrice", "Cardmarket average sell", 2],
          ["avg30", "Cardmarket 30d avg", 2],
          ["avg7", "Cardmarket 7d avg", 1],
          ["avg1", "Cardmarket 1d avg", 1],
          ["lowPrice", "Cardmarket low", 1],
        ];
    for (const [key, label, weight] of fields) {
      if (typeof cm.prices[key] === "number" && cm.prices[key] > 0) {
        points.push({ label, value: cm.prices[key], days, weight });
      }
    }
  }
  for (const c of comps) {
    if (c.kind === "graded") continue;
    points.push({
      label: `Your comp${c.note ? ": " + c.note : ""}`,
      value: c.price,
      days: daysSince(c.date),
      weight: 2,
      isComp: true,
    });
  }
  return points;
}

const GRADED_AVERAGE_WINDOW = 5;

function computeGradedSuggestion(comps, company, grade) {
  const matching = comps
    .filter((c) => c.kind === "graded" && c.grade?.company === company && String(c.grade?.grade) === String(grade))
    .map((c) => ({ value: c.price, days: daysSince(c.date), note: c.note, date: c.date }))
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
  if (matching.length === 0) return null;
  const recent = matching.slice(0, GRADED_AVERAGE_WINDOW);
  const values = recent.map((m) => m.value);
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  const freshest = recent.filter((m) => m.days != null && m.days <= 60);
  const confidence = freshest.length >= 2 ? "high" : recent.length >= 2 ? "medium" : "low";
  return {
    suggested: average,
    range: [Math.min(...values), Math.max(...values)],
    confidence,
    count: recent.length,
    totalLogged: matching.length,
    matching: recent,
    newestDays: recent[0].days,
  };
}

function summarize(points) {
  if (points.length === 0) return null;
  const withDays = points.filter((p) => p.days != null);
  const fresh = withDays.filter((p) => p.days <= 30);
  const semiFresh = withDays.filter((p) => p.days <= 90);
  const usable = fresh.length ? fresh : semiFresh.length ? semiFresh : points;

  let weightSum = 0;
  let weighted = 0;
  for (const p of usable) {
    weighted += p.value * p.weight;
    weightSum += p.weight;
  }
  const suggested = weightSum ? weighted / weightSum : usable[0].value;
  const values = usable.map((p) => p.value);
  const range = [Math.min(...values), Math.max(...values)];

  let confidence = "low";
  if (fresh.length >= 2) confidence = "high";
  else if (fresh.length === 1 || points.length >= 2) confidence = "medium";

  return { suggested, range, confidence, usable, allPoints: points };
}

function renderDetail() {
  const card = state.currentCard;
  const variant = state.currentVariant;
  const comps = (store.getComps()[card.id] || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const summary = summarize(computeDataPoints(card, variant, comps));
  const conditionPct = state.currentConditionPct;
  const priceMode = state.priceMode;
  const gradedSuggestion = computeGradedSuggestion(comps, state.gradedCompany, state.gradedGrade);

  const variants = Object.keys(card.tcgplayer?.prices || {});
  const variantButtons = variants
    .map(
      (v) =>
        `<button class="variant-btn ${v === variant ? "active" : ""}" data-variant="${v}">${variantLabel(v)}</button>`
    )
    .join("");

  const tcgUpdated = card.tcgplayer?.updatedAt ? daysSince(card.tcgplayer.updatedAt) : null;
  const cmUpdated = card.cardmarket?.updatedAt ? daysSince(card.cardmarket.updatedAt) : null;

  const tcgRows = variant && card.tcgplayer?.prices?.[variant]
    ? Object.entries(card.tcgplayer.prices[variant])
        .filter(([, v]) => typeof v === "number")
        .map(
          ([k, v]) =>
            `<tr><td>${k}</td><td>${formatMoney(v)}</td><td class="${tcgUpdated != null && tcgUpdated <= 30 ? "fresh" : "stale"}">${formatDaysAgo(tcgUpdated)}</td></tr>`
        )
        .join("")
    : "";

  const CM_FIELDS = variant === "reverseHolofoil"
    ? [["reverseHoloTrend", "reverse holo trend"], ["reverseHoloAvg30", "reverse holo 30d avg"], ["reverseHoloAvg7", "reverse holo 7d avg"], ["reverseHoloAvg1", "reverse holo 1d avg"]]
    : [["trendPrice", "trend"], ["averageSellPrice", "average sell"], ["avg30", "30d avg"], ["avg7", "7d avg"], ["avg1", "1d avg"], ["lowPrice", "low"]];
  const cmRows = card.cardmarket?.prices
    ? CM_FIELDS.filter(([k]) => typeof card.cardmarket.prices[k] === "number" && card.cardmarket.prices[k] > 0)
        .map(
          ([k, label]) =>
            `<tr><td>${label}</td><td>${formatMoney(card.cardmarket.prices[k])}</td><td class="${cmUpdated != null && cmUpdated <= 30 ? "fresh" : "stale"}">${formatDaysAgo(cmUpdated)}</td></tr>`
        )
        .join("")
    : "";

  const compRows = comps
    .map((c, i) => {
      const tag = c.kind === "graded" && c.grade ? `<span class="comp-tag">${c.grade.company} ${c.grade.grade}</span>` : "";
      return `<div class="comp-item"><span>${tag}${formatMoney(c.price)}${c.note ? " — " + c.note : ""}</span><span>${c.date} <a href="#" data-remove-comp="${i}" style="color:var(--bad);margin-left:8px;">remove</a></span></div>`;
    })
    .join("");

  const rawSuggestedBlock = summary
    ? `
      <span class="confidence-badge confidence-${summary.confidence}">${summary.confidence.toUpperCase()} CONFIDENCE</span>
      <div class="suggested-price">${formatMoney(summary.suggested * (conditionPct / 100))}</div>
      <div class="suggested-range">Range: ${formatMoney(summary.range[0] * (conditionPct / 100))} – ${formatMoney(summary.range[1] * (conditionPct / 100))} at ${conditionPct}% condition, based on ${summary.usable.length} data point${summary.usable.length === 1 ? "" : "s"}</div>
    `
    : `<div class="no-data">No pricing data found for this card/variant yet. Add a comp below if you've seen a recent sale.</div>`;

  const rawEbayUrl = buildEbaySoldSearchUrl(card, [CONDITIONS.find((c) => c.pct === conditionPct)?.code]);
  const rawTcgplayerUrl = buildTcgplayerSearchUrl(card);

  const rawModeBlock = `
    ${rawSuggestedBlock}
    <div class="condition-row">
      <label for="condition-select">Condition</label>
      <select id="condition-select"></select>
    </div>
    <a class="link-btn" href="${rawTcgplayerUrl}" target="_blank" rel="noopener">🛒 Check TCGplayer ↗</a>
    <a class="link-btn" href="${rawEbayUrl}" target="_blank" rel="noopener">🔍 Check eBay sold listings ↗</a>
  `;

  const STALE_COMP_DAYS = 30;
  const staleWarning = gradedSuggestion && gradedSuggestion.newestDays != null && gradedSuggestion.newestDays > STALE_COMP_DAYS
    ? `<div class="backup-note">⚠ Your newest logged comp is ${formatDaysAgo(gradedSuggestion.newestDays)} — eBay prices move fast. Check the listings again and log a fresh comp before relying on this.</div>`
    : "";

  const gradedSuggestedBlock = gradedSuggestion
    ? `
      <span class="confidence-badge confidence-${gradedSuggestion.confidence}">${gradedSuggestion.confidence.toUpperCase()} CONFIDENCE</span>
      <div class="suggested-price">${formatMoney(gradedSuggestion.suggested)}</div>
      <div class="suggested-range">Average of your ${gradedSuggestion.count} most recent logged comp${gradedSuggestion.count === 1 ? "" : "s"}${gradedSuggestion.totalLogged > gradedSuggestion.count ? ` (of ${gradedSuggestion.totalLogged} total logged)` : ""} · range ${formatMoney(gradedSuggestion.range[0])} – ${formatMoney(gradedSuggestion.range[1])}</div>
      ${staleWarning}
    `
    : `<div class="no-data">No ${state.gradedCompany} ${state.gradedGrade} comps logged yet for this card. Tap "Check eBay sold listings" below to see real recent sales for this exact card/grade, then log what you find as a comp — it's remembered for every future lookup of this card.</div>`;

  const gradedEbayUrl = buildEbaySoldSearchUrl(card, [state.gradedCompany, state.gradedGrade]);
  const gradedTcgplayerUrl = buildTcgplayerSearchUrl(card);

  const gradedModeBlock = `
    <div class="condition-row">
      <label for="grade-company-select">Company</label>
      <select id="grade-company-select"></select>
      <label for="grade-value-select">Grade</label>
      <select id="grade-value-select"></select>
    </div>
    ${gradedSuggestedBlock}
    <a class="link-btn" href="${gradedEbayUrl}" target="_blank" rel="noopener">🔍 Check eBay sold listings for ${state.gradedCompany} ${state.gradedGrade} ↗</a>
    <a class="link-btn" href="${gradedTcgplayerUrl}" target="_blank" rel="noopener">🛒 Check TCGplayer (raw price reference) ↗</a>
    ${gradedSuggestion ? `<button class="text-btn" id="clear-graded-comps-btn">Clear ${state.gradedCompany} ${state.gradedGrade} comps &amp; start fresh</button>` : ""}
  `;

  el.detailContent.innerHTML = `
    <div class="card-head">
      <img src="${card.images?.large || card.images?.small || ""}" alt="" onerror="this.style.visibility='hidden'" />
      <div>
        <h2>${card.name}</h2>
        <div class="set-line">${card.set?.name || ""} · #${card.number}${card.set?.printedTotal ? "/" + card.set.printedTotal : ""}</div>
        <div class="set-line">${card.rarity || ""}${card.set?.releaseDate ? " · Released " + card.set.releaseDate : ""}</div>
        ${card._source === "TCGdex (backup)" ? `<div class="backup-note">⚠ Backup source (pokemontcg.io was unavailable) — prices may differ slightly</div>` : ""}
        ${card._crossReferenced?.length ? `<div class="xref-note">✓ ${card._crossReferenced.join(" & ")} data filled in from a second source</div>` : ""}
      </div>
    </div>

    <div class="section-box">
      <h3>Suggested fair price</h3>
      <div class="mode-toggle">
        <button class="mode-btn ${priceMode === "raw" ? "active" : ""}" data-mode="raw">Raw</button>
        <button class="mode-btn ${priceMode === "graded" ? "active" : ""}" data-mode="graded">Graded</button>
      </div>
      ${priceMode === "graded" ? gradedModeBlock : rawModeBlock}
    </div>

    ${variants.length ? `
    <div class="section-box">
      <h3>Print / variant</h3>
      <div class="variant-row">${variantButtons}</div>
      ${tcgRows ? `<table class="price-table"><thead><tr><th>TCGplayer</th><th>Price</th><th>Updated</th></tr></thead><tbody>${tcgRows}</tbody></table>` : `<div class="no-data">No TCGplayer data for this variant.</div>`}
    </div>` : ""}

    ${cmRows ? `
    <div class="section-box">
      <h3>Cardmarket (EU)</h3>
      <table class="price-table"><thead><tr><th>Field</th><th>Price</th><th>Updated</th></tr></thead><tbody>${cmRows}</tbody></table>
    </div>` : ""}

    <div class="section-box">
      <h3>Your comps / notes</h3>
      ${compRows || `<div class="no-data">No comps added yet. If you spot a recent sale (eBay, another vendor, etc.) log it here — it factors into the suggested price above.</div>`}
      <div class="comp-add-row">
        <input type="number" id="comp-price" placeholder="Price" step="0.01" />
        <input type="text" id="comp-note" placeholder="Note (e.g. ebay sold)" />
        <button class="text-btn" id="comp-add-btn">${priceMode === "graded" ? `Add ${state.gradedCompany} ${state.gradedGrade}` : "Add"}</button>
      </div>
    </div>
  `;

  el.detailContent.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.priceMode = btn.dataset.mode;
      renderDetail();
    });
  });

  if (priceMode === "graded") {
    const companySelect = document.getElementById("grade-company-select");
    Object.entries(GRADING_COMPANIES).forEach(([key, c]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = c.label;
      if (key === state.gradedCompany) opt.selected = true;
      companySelect.appendChild(opt);
    });
    companySelect.addEventListener("change", (e) => {
      state.gradedCompany = e.target.value;
      state.gradedGrade = GRADING_COMPANIES[state.gradedCompany].grades[0];
      renderDetail();
    });

    const gradeSelect = document.getElementById("grade-value-select");
    GRADING_COMPANIES[state.gradedCompany].grades.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;
      if (g === state.gradedGrade) opt.selected = true;
      gradeSelect.appendChild(opt);
    });
    gradeSelect.addEventListener("change", (e) => {
      state.gradedGrade = e.target.value;
      renderDetail();
    });
  } else {
    const condSelect = document.getElementById("condition-select");
    CONDITIONS.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.pct;
      opt.textContent = c.label;
      if (c.pct === conditionPct) opt.selected = true;
      condSelect.appendChild(opt);
    });
    condSelect.addEventListener("change", (e) => {
      state.currentConditionPct = Number(e.target.value);
      renderDetail();
    });
  }

  document.getElementById("clear-graded-comps-btn")?.addEventListener("click", () => {
    const allComps = store.getComps();
    const list = allComps[card.id] || [];
    allComps[card.id] = list.filter(
      (c) => !(c.kind === "graded" && c.grade?.company === state.gradedCompany && String(c.grade?.grade) === state.gradedGrade)
    );
    store.setComps(allComps);
    renderDetail();
  });

  el.detailContent.querySelectorAll(".variant-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.currentVariant = btn.dataset.variant;
      renderDetail();
    });
  });

  const addBtn = document.getElementById("comp-add-btn");
  addBtn.addEventListener("click", () => {
    const priceInput = document.getElementById("comp-price");
    const noteInput = document.getElementById("comp-note");
    const price = parseFloat(priceInput.value);
    if (!price || price <= 0) return;
    const allComps = store.getComps();
    const list = allComps[card.id] || [];
    const entry = { price, note: noteInput.value.trim(), date: new Date().toISOString().slice(0, 10) };
    if (state.priceMode === "graded") {
      entry.kind = "graded";
      entry.grade = { company: state.gradedCompany, grade: state.gradedGrade };
    } else {
      entry.kind = "raw";
    }
    list.push(entry);
    allComps[card.id] = list;
    store.setComps(allComps);
    renderDetail();
  });

  el.detailContent.querySelectorAll("[data-remove-comp]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const idx = Number(a.dataset.removeComp);
      const allComps = store.getComps();
      const list = allComps[card.id] || [];
      list.splice(idx, 1);
      allComps[card.id] = list;
      store.setComps(allComps);
      renderDetail();
    });
  });
}

el.cameraBtn.addEventListener("click", () => el.cameraInput.click());
el.cameraInput.addEventListener("change", async () => {
  const file = el.cameraInput.files[0];
  if (!file) return;
  el.ocrStatus.hidden = false;
  el.ocrStatus.textContent = "Reading card photo…";
  try {
    const result = await Tesseract.recognize(file, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          el.ocrStatus.textContent = `Reading card photo… ${Math.round(m.progress * 100)}%`;
        }
      },
    });
    const text = result.data.text || "";
    const guess = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= 3 && /[a-zA-Z]{3,}/.test(l))
      .sort((a, b) => b.length - a.length)[0];
    el.ocrStatus.hidden = true;
    if (guess) {
      el.searchInput.value = guess.replace(/[^a-zA-Z '-]/g, "").trim();
      runSearch(el.searchInput.value);
    } else {
      el.searchStatus.textContent = "Couldn't read text from photo — try typing the name instead.";
    }
  } catch (err) {
    el.ocrStatus.hidden = true;
    el.searchStatus.textContent = "Photo scan failed — try typing the name instead.";
  }
  el.cameraInput.value = "";
});

el.settingsBtn.addEventListener("click", () => {
  setHomeVisible(false);
  el.detailView.hidden = true;
  el.settingsView.hidden = false;
  el.apiKeyInput.value = store.getApiKey();
  el.conditionDefault.innerHTML = "";
  CONDITIONS.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.pct;
    opt.textContent = c.label;
    if (c.pct === store.getConditionDefault()) opt.selected = true;
    el.conditionDefault.appendChild(opt);
  });
});

el.saveSettingsBtn.addEventListener("click", () => {
  store.setApiKey(el.apiKeyInput.value.trim());
  store.setConditionDefault(Number(el.conditionDefault.value));
  el.settingsView.hidden = true;
  setHomeVisible(true);
  renderRecent();
});

el.clearHistoryBtn.addEventListener("click", () => {
  store.setHistory([]);
  renderRecent();
});

renderRecent();
renderMostChecked();
loadWatchlist();
loadNewReleases();
