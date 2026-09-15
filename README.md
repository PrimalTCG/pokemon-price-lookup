# Card Fair Price

A mobile-first, no-backend lookup tool for pricing Pokémon cards at shows. Search by name or snap
a photo, see TCGplayer + Cardmarket pricing broken out by print/variant with recency shown for
every number, and get a suggested fair-price range that flags how confident the data actually is.
For cards with little or no market data, log your own comps (a sale you just saw, a graded price,
etc.) and they factor into the suggestion.

It's a static site — no server, no build step, no database. All data comes live from the free
[pokemontcg.io](https://pokemontcg.io) API at lookup time; your API key, recent lookups, and comps
are stored only in your phone's browser (`localStorage`), never sent anywhere else.

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

## Known limitations

- Card photo scanning uses on-device OCR (Tesseract.js) to read text off the card and feed it into
  the name search — it's a convenience for typing less, not real card recognition. It works best
  on a clear, well-lit shot of the card name; error cases just fall back to manual search.
- Pricing is pokemontcg.io's TCGplayer/Cardmarket feed only — no live eBay sold-comp data (would
  need a separate API and developer credentials to add later).
- Graded card (PSA/BGS) pricing isn't pulled from a live source; the condition multiplier is a
  manual raw-card heuristic only.
