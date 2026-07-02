# Government Contract Scraper

Scrapes US government contract data from the two platforms at the center of
the government-contracting playbook:

- **[SAM.gov](https://sam.gov)** — the federal government's official contract
  opportunity portal. Every federal solicitation above the micro-purchase
  threshold is posted here. This is where you find contracts to bid on.
- **[USASpending.gov](https://www.usaspending.gov)** — the public record of
  what the government actually paid on past contracts. This is your
  past-pricing research tool: find what the previous contractor charged for
  the same work, and price your bid below it.

Both sources are normalized to a single record shape so results can be
merged, filtered, and exported together as JSON or CSV.

## Setup

USASpending.gov needs no credentials. SAM.gov requires a free API key:

1. Sign in at [sam.gov](https://sam.gov) (registration is free).
2. Open **Account Details** and request a **Public API Key**.
3. Export it: `export SAM_GOV_API_KEY=your-key-here`

Then build the project:

```bash
npm install
npm run build
```

## CLI usage

```bash
# Open small-business landscaping solicitations posted in the last 30 days,
# skipping anything that closes in under 14 days (no time to gather quotes)
npm run scrape -- --naics 561730 --set-aside SBA --min-deadline-days 14

# Keyword search across opportunity titles, limited to one state
npm run scrape -- --keywords "hazardous waste" --state CA

# Past-pricing research: what has the government paid for similar work?
npm run scrape -- --source awards --keywords catering \
  --agency "Department of Defense" --max-amount 350000

# Export to CSV for a spreadsheet
npm run scrape -- --source awards --naics 561730 --format csv --out pricing.csv
```

Run `npm run scrape -- --help` for the full option list.

### Useful filter values

| Filter | Values |
| --- | --- |
| Starter NAICS codes | `561730` landscaping, `562112` hazardous waste collection, `722310` food service contractors, `812990` all other personal services |
| Set-aside codes | `SBA` total small business, `8A`, `WOSB` woman-owned, `SDVOSBC` service-disabled veteran-owned, `HZC` HUBZone |
| Notice types | `o` solicitation, `p` presolicitation, `k` combined synopsis/solicitation, `r` sources sought, `s` special notice, `a` award notice |

## MCP tools

The MCP server also exposes the scraper as two tools, so an AI agent can run
the whole find-and-price workflow conversationally:

- **`search_contract_opportunities`** — search open SAM.gov solicitations by
  keyword, NAICS, set-aside, state, agency, and posted window, with an
  optional minimum days-until-deadline filter.
- **`search_contract_awards`** — search past USASpending.gov awards (sorted
  largest first) by keyword, NAICS, agency, and award-amount bounds. No API
  key required.

## The bid-research workflow

The scraper is built around a specific selection strategy for finding
biddable contracts:

1. **Find open opportunities** you can understand — service contracts
   (landscaping, waste disposal, catering, cleaning), not products. Filter
   by NAICS and set-aside to cut competition.
2. **Check deadline realism** — `--min-deadline-days 14` drops solicitations
   that close before you could collect subcontractor quotes.
3. **Target the RFQ range** — contracts under ~$350,000 typically require no
   past performance, just a quote. Use `--max-amount 350000` on award
   searches to study that segment.
4. **Research past pricing** — before bidding, search awards for the same
   work with the same agency or in the same state. The previous contract's
   price is your ceiling; bid below it while keeping a margin above your
   subcontractor's quote.

## Module layout

```
src/scraper/
├── types.ts        # Normalized ContractRecord + filter types
├── http.ts         # fetch wrapper with 429/5xx retry + backoff
├── sam-gov.ts      # SAM.gov Get Opportunities API client
├── usaspending.ts  # USASpending.gov award search API client
├── scraper.ts      # Orchestrator combining both sources
├── csv.ts          # CSV export
└── cli.ts          # Command-line interface
```

Rate limiting: SAM.gov personal API keys have a small daily request quota,
so the client fetches large pages with a delay between requests and backs
off exponentially on 429 responses.
