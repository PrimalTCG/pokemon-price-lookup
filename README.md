# Card Fair Price

A mobile-first, no-backend lookup tool for pricing Pokémon cards at shows. Search by name or snap
a photo, see TCGplayer + Cardmarket pricing broken out by print/variant with recency shown for
every number, and get a suggested fair-price range that flags how confident the data actually is.
For cards with little or no market data, log your own comps (a sale you just saw, a graded price,
etc.) and they factor into the suggestion.

It's a static site — no server, no build step, no database. Pricing comes live from the free
[pokemontcg.io](https://pokemontcg.io) API at lookup time, with [TCGdex](https://tcgdex.dev) as an
automatic backup source if pokemontcg.io is down or erroring (see below); your API key, recent
lookups, comps, and a short results cache are stored only in your phone's browser (`localStorage`),
never sent anywhere else.

## Run it locally

```
cd pokemon-price-lookup
python3 -m http.server 8000
```

Then open `http://localhost:8000` on the same machine, or `http://<your-computer's-LAN-IP>:8000`
from your phone if it's on the same WiFi.

## Deploy it so it works away from home WiFi

Any static host works. Easiest options:

- **Netlify Drop**: go to https://app.netlify.com/drop and drag the `pokemon-price-lookup` folder
  in. You get a live URL in seconds, no account required to start.
- **GitHub Pages**: push this folder to a GitHub repo, enable Pages on it (Settings → Pages →
  deploy from branch), and you get a stable `https://<you>.github.io/<repo>` URL.
- **Vercel**: `npx vercel` from inside this folder.

Once deployed, open the URL on your phone and use "Add to Home Screen" (Safari: Share → Add to
Home Screen; Chrome: menu → Add to Home Screen) so it launches like an app at shows.

## Get a free API key (recommended)

Without a key, pokemontcg.io caps you around ~30 requests/minute shared across all free users,
which can get slow during a busy show. Get a free key at https://pokemontcg.io/getStarted and
paste it into the app's Settings (gear icon, top right) — it raises your personal limit
substantially and is stored only on your device.

## How the suggested price is calculated

For the selected card + print/variant, the app collects every numeric price point it can find:

- TCGplayer market/low/mid/high for that specific variant (e.g. holofoil vs. 1st edition vs.
  reverse holo — these are tracked separately since prices differ a lot by print)
- Cardmarket (EU market) trend price and 1/7/30-day rolling averages
- Any comps you've manually logged for that card

Each point is tagged with how many days old it is (pulled from the API's own `updatedAt` per
source). The app prefers points updated within the last 30 days; if none exist it falls back to
90-day-old data, and only falls back to fully stale/sparse data as a last resort — which is
exactly the situation where you'll want to lean on your own judgment and log a comp if you see
one. The confidence badge (HIGH/MEDIUM/LOW) tells you at a glance how thin the underlying data is:
LOW means the number is a rough starting point, not a market price. All raw numbers are always
shown underneath so you can override the suggestion with your own read of the card.

Condition adjustment (Near Mint down to Damaged) uses standard vendor rule-of-thumb percentage
discounts off the raw suggested price — not live graded-sale data, since no graded price source is
wired in yet. Treat it as a quick adjustment, not gospel.

### Raw vs. Graded mode

Each card's "Suggested fair price" panel has a Raw / Graded toggle:

- **Raw** is everything above — market data + your comps, adjusted by condition percentage.
- **Graded** lets you pick a company (PSA, Beckett/BGS, CGC, TAG) and a grade (1–10, with half-point
  steps for BGS/CGC/TAG since those companies grade that way). There is intentionally **no live
  graded-price feed** behind this — eBay's sold-listings API (Marketplace Insights) is a Limited
  Release that eBay isn't approving new applicants for, and scraping eBay directly would violate
  their terms and break constantly, so neither was viable. Instead, both modes show a **"🔍 Check
  eBay sold listings"** button that deep-links straight to eBay's own sold-listings search, already
  filtered to Sold + Completed and sorted by most recently ended — so you review the same real
  listings eBay shows anyone, in one tap, no scraping involved. The search query is built to match
  how graded cards actually get listed (researched against real eBay titles): release year +
  "Pokemon" + card name + set name + card number/set total + company + grade, e.g. `2000 Pokemon
  Blaine's Charizard Gym Challenge 2/132 PSA 10` — in testing this consistently surfaces the exact
  card as the top result rather than a flood of loosely related listings. The suggested graded
  price itself is the **average of your 5 most recent logged comps** for that exact company+grade
  (fewer than 5 if you haven't logged that many yet), via a comp form scoped to whichever grade
  you're viewing. It's honest rather than guessed: if you haven't logged a sale for a card/grade
  yet, it says so plainly instead of showing a fabricated number, and points you at the eBay button
  to go check. Once logged, a comp is remembered for every future lookup of that card — this is
  necessarily a manual step since eBay's own sold-listings API isn't open to new applicants and
  this app won't scrape eBay's pages (see "Staying up during an outage" and known limitations).

  Because comps are a snapshot rather than a live feed, they go stale — a PSA 10 you logged last
  month isn't what the card is worth today. If the newest comp you've logged for a grade is more
  than 30 days old, the panel shows a plain warning to go recheck eBay, and a **"Clear ... comps &
  start fresh"** button removes just that card's comps for the currently-viewed company+grade in
  one tap, so re-checking and re-logging is fast instead of deleting entries one at a time.

### Check TCGplayer

Both modes also have a **"🛒 Check TCGplayer"** button, deep-linking to TCGplayer's own product
search — researched the same way as the eBay one. TCGplayer's search (`card name + set name + card
number/set total`, e.g. `Blaine's Charizard Gym Challenge 2/132`) reliably puts the exact card as
the first result with its real live Market Price, since TCGplayer is a structured product catalog
rather than free-text listings like eBay. A bare numeric TCGplayer product ID
(`tcgplayer.com/product/<id>`) would link even more precisely, but neither pokemontcg.io nor TCGdex
expose that ID cleanly without following an affiliate-tracked redirect chain that isn't appropriate
to route users through silently — the search link is the clean, reliable alternative.

The two buttons are ordered deliberately: in **Raw** mode, TCGplayer is listed above eBay, since
TCGplayer is the standard raw/ungraded singles market; in **Graded** mode, eBay is listed above
TCGplayer, since eBay sold listings are the real signal for graded slabs and TCGplayer there is
only a secondary raw-price reference point.

## Staying up during an outage

pokemontcg.io occasionally throws server errors (it's a free community API). To keep the app
usable at a show even then, every search follows this order:

1. **pokemontcg.io**, retried once automatically on a server error before giving up.
2. **TCGdex**, a separate free/open card database that carries the same underlying TCGplayer and
   Cardmarket pricing feeds. If pokemontcg.io fails or returns zero results, the app silently
   retries the search here instead. When this happens, you'll see "backup source" in the results
   count and a warning note on the card detail page, since coverage/freshness can differ slightly
   from pokemontcg.io.
3. **Local cache**: every successful search (from either source) is cached on your phone. If both
   live sources are down, a repeat search for a card you already looked up today still works,
   clearly labeled as cached with how old it is.

If all three come up empty (a brand-new search term during a total outage), the app tells you
plainly rather than hanging, so you can fall back to your own judgment and log a manual comp.

### Cross-referencing to close pricing gaps

pokemontcg.io and TCGdex are both third-party aggregators of TCGplayer/Cardmarket's price feeds —
neither has 100% real-time coverage of every card, so occasionally a card that clearly has a price
on tcgplayer.com shows nothing from whichever source answered your search first. To close that gap,
whenever a result is missing TCGplayer and/or Cardmarket pricing, the app automatically checks the
*other* source (by card ID, which is compatible between the two APIs for the large majority of
cards) and fills in whatever that source has. You'll see a small "✓ filled in from a second source"
note on a card detail page when this happened. If a card is still showing "no data" after that, it
genuinely isn't priced yet in either database — that's the moment to log a comp.

## Side panels (wide screens only)

On a desktop-width browser window (roughly 1320px+ — hidden entirely on phone, where there's no
room and the app stays exactly as it was), two panels flank the search screen:

- **Watchlist Movers** (left): a curated list of well-known valuable cards (Charizard, Umbreon
  VMAX, etc.), each showing real 7-day-vs-30-day Cardmarket average price movement, sorted by
  biggest movers first. This is **not** a market-wide "trending" feed — no such data source exists
  publicly — it's a fixed watchlist with genuinely computed price deltas from the same Cardmarket
  data already used elsewhere in the app. Cached locally for 12 hours so it doesn't re-fetch on
  every visit; each lookup is a single short-timeout request with no retry or fallback chain, kept
  deliberately lightweight so a slow/degraded API can't stall the page (14 requests fired at once
  is enough to feel it if they cascade).
- **Your Most Checked** (right, top): cards you've personally looked up most often on this device —
  genuinely tracked locally, not a claim about what other vendors are searching.
- **New Releases** (right, bottom): the actual newest Pokémon cards by real set release date.

All three link straight into the normal card detail view on click. None of this claims to be
"most searched" in any global sense or algorithmic "trending" — there's no data source that would
make that honest, so it isn't built.

## Known limitations

- Card photo scanning uses on-device OCR (Tesseract.js) to read text off the card and feed it into
  the name search — it's a convenience for typing less, not real card recognition. It works best
  on a clear, well-lit shot of the card name; error cases just fall back to manual search.
- Pricing is pokemontcg.io/TCGdex's TCGplayer/Cardmarket feed only — no live eBay sold-comp API,
  since eBay's Marketplace Insights API isn't open to new applicants and scraping eBay isn't
  something this app does. The "Check eBay sold listings" button is the workaround: a deep link to
  eBay's own real search results, reviewed by you rather than pulled automatically.
- Graded card (PSA/BGS/CGC/TAG) suggested prices are entirely built from comps you log yourself
  after checking the eBay link — there's no automatic graded-price feed for the same reason above.
- Cross-referencing (see above) matches cards by ID between pokemontcg.io and TCGdex, which isn't
  guaranteed for every promo/subset print — some gaps can't be closed automatically and still need
  a manual comp.
