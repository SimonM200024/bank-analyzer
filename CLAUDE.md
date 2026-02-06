# CLAUDE.md - Bank Analyzer

## Project Overview

Bank Analyzer v9 is a personal finance dashboard for importing and analyzing bank statements (primarily NLB - Nova Ljubljanska Banka, a Slovenian bank). It is a **single-file web application** — the entire app lives in `index.html` (~7,500 lines of HTML, CSS, and vanilla JavaScript). There is no build system, no package manager, and no server-side code.

## Repository Structure

```
bank-analyzer/
  index.html    # Complete application (HTML + CSS + JS, ~7500 lines)
  README.md     # Brief project description
  CLAUDE.md     # This file
```

### index.html Layout

| Line Range | Section |
|---|---|
| 1-15 | `<head>` — meta tags, CDN imports |
| 16-2693 | `<style>` block and HTML markup (UI structure) |
| 2695-7505 | `<script>` block — all application logic |

Key code landmarks within `<script>`:
- **Lines 2697-2710**: Firebase configuration and initialization, pdf.js setup
- **Lines 2712-2757**: Application state variables
- **Lines 2763-2783**: `CATS` object — category definitions with keywords, colors, icons
- **Lines 2789-2814**: Helper functions (`fmt`, `notify`, `categorize`)
- **Lines 2816+**: Auth handler, data loading, page rendering, all feature logic

## Tech Stack

- **HTML5 / CSS3 / Vanilla JavaScript** — no frameworks
- **Firebase** (v10.7.1 compat) — Auth (email/password), Realtime Database, Storage
- **Chart.js** (v4.4.1) — pie charts, line charts, bar charts
- **D3.js** (v7) + d3-sankey (v0.12.3) — Sankey diagrams, treemaps, advanced visualizations
- **pdf.js** (v3.11.174) — PDF bank statement parsing
- **Google Fonts** — Inter typeface

All dependencies are loaded via CDN. There are no npm packages or local dependencies.

## Development Workflow

### Running Locally

Open `index.html` directly in a browser, or serve it with any static file server:

```bash
python3 -m http.server 8000
# Then visit http://localhost:8000
```

No build step, transpilation, or bundling is required.

### Testing

There is no test suite. Changes should be tested manually in the browser.

### Linting / Formatting

There are no linting or formatting tools configured. The codebase uses a compact, minified-style CSS and readable JavaScript with consistent semicolon usage.

### CI/CD

There is no CI/CD pipeline. Deployment is manual.

## Architecture

### Single-Page Application (SPA)

The app is a client-side SPA with 10 pages, switched via `switchPage(page)`:

| Page | Description |
|---|---|
| `overview` | Main dashboard with analytics widgets and visualizations |
| `transactions` | Paginated transaction table with filtering, bulk actions |
| `insights` | AI-powered financial insights and recommendations |
| `tools` | Financial calculators (loan, mortgage, compound interest, emergency fund, what-if) |
| `merchants` | Merchant analysis and custom categorization rules |
| `subscriptions` | Recurring transaction detection and tracking |
| `reports` | Financial report generation (printable HTML) |
| `imports` | PDF bank statement import interface |
| `stocks` | Stock portfolio tracking with real-time prices |
| `users` | Admin-only user management panel |

### State Management

All state is held in module-level `let` variables (lines 2712-2757). Key state:

- `currentUser` — Firebase auth user object
- `imports` — imported bank statement data (keyed by import ID)
- `catOverrides` — per-transaction category overrides
- `txnNotes` — transaction notes/tags
- `activeTxns` / `filteredTxns` — current working set of transactions
- `stocks` — stock portfolio entries
- `dashboardSettings` — UI theme, layout, widget visibility
- `merchantRules` — user-defined categorization rules
- `alerts` — alert configuration

### Transaction Categorization

The `categorize(desc)` function (line 2797) assigns categories by checking, in order:

1. Manual per-transaction overrides (`catOverrides`)
2. Custom merchant rules (`merchantRules`)
3. Built-in keyword matching against `CATS` (19 categories: Groceries, Fuel, Restaurants, Travel, Shopping, Clothing, Jewelry, Sports, Parties, Entertainment, Transportation, Transfers, Education, Health, Services, Income, ATM, Personal, Other)

### Data Persistence

- **Firebase Realtime Database** — user data, transactions, category overrides, merchant rules, stocks, alerts
- **localStorage** — dashboard settings, theme preferences

### Theming

Four themes controlled by CSS variables on `:root`:
- `dark` (default) — dark blue palette
- `light` — light gray palette
- `midnight` — deep dark with purple accents
- `nature` — dark green palette

### External API Integrations

- **Yahoo Finance** — stock price data (`query1.finance.yahoo.com`) with CORS proxy fallbacks
- **Currency exchange API** — multi-currency support (EUR, USD, GBP, CHF, JPY, and 8+ more)

## Key Conventions

- **DOM access**: Uses `const $ = id => document.getElementById(id)` as a shorthand
- **Currency formatting**: `fmt(n)` formats numbers as EUR using `de-DE` locale
- **Notifications**: `notify(msg, type)` shows toast-style messages
- **Data saving**: `saveData()` persists state to Firebase
- **Chart instances**: Stored in module-level variables (`pieChart`, `lineChart`, `barChart`, etc.) and destroyed before re-creation to prevent memory leaks

## Important Notes for AI Assistants

1. **Single file**: All changes go into `index.html`. There are no separate JS/CSS files to create.
2. **No build step**: Changes are immediately effective — just reload the browser.
3. **Firebase config is embedded**: The Firebase API key and project config are hardcoded in the file (this is normal for client-side Firebase apps, as security rules protect the data).
4. **Keyword matching is case-insensitive**: The `categorize` function converts descriptions to uppercase before matching.
5. **Large file**: At ~7,500 lines, be precise with line references when making edits. Read the relevant section before modifying.
6. **No tests to run**: Manual browser testing is the only verification method.
7. **Slovenian context**: Many keywords, merchants, and bank formats are Slovenian (NLB bank statements). Category keywords include Slovenian terms.
