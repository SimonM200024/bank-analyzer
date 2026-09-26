# Adrial Workspace front end, with bank reconciliation

These are the static front-end files served by the Adrial Workspace Cloud Run service (staging), mirrored as deployed and extended with a **Bank reconciliation** page (`#bank`, under Operations).

The backend is unchanged. The new page only uses commands the existing API already accepts:

| Statement line | Workspace record | Command |
| --- | --- | --- |
| Money in | Payment on an open invoice record | `invoice.payment` (owner/administrator) |
| Money out | New paid expense in Costs & expenses | `hub.save` · `costs` |
| Money out matching a planned expense | That expense marked Paid | `hub.save` · `costs` with its revision |

## What it does

- Imports **ISO 20022 camt.053/camt.052** XML and **CSV** exports (`;`, `,`, tab; decimal comma or dot; split debit/credit columns; Windows-1250 fallback). CSV columns are detected automatically and can be adjusted in the preview.
- Suggests matches: invoice reference or number in the payment details, amount equal to the open balance, and payer name matching the customer. Money out gets a category from keyword rules (bank fees, FURS/VAT, payroll, fuel, software…), from known suppliers, or from categories you used before for that counterparty.
- Confirm a single line, review and edit it, confirm all confident suggestions at once, or ignore lines such as internal transfers.
- Shows money in and out, net cash flow, reconciliation progress, cash flow by month and money out by category.
- Statement lines stay in the browser (`localStorage`, per user and workspace). Every recorded payment reference and expense note carries the statement line id (`#xxxxxxxxxx`), so re-importing a statement, or the same transactions in another format, never creates duplicates. A reversed payment or an archived expense reopens its line.
- English and Slovenian.

## Files

| File | Change |
| --- | --- |
| `bank-model.js` | New. Parsers and matching; pure functions, no DOM. |
| `bank.js` | New. Page, dialogs and events. |
| `app.js` | Nav entry, route, icons, module description, help section. |
| `styles.css` | `bank-*` styles appended. |
| `si.js` | Slovenian strings appended. |
| everything else | As served by staging on 2026-09-26. |

To deploy, add `bank.js` and `bank-model.js` to the service's static files and replace `app.js`, `styles.css` and `si.js`.

## Run locally

```sh
cd workspace
npm test          # parser and matching tests (node:test)
npm run dev       # mock API with fictional data on http://localhost:8787/app#bank
```

`dev/mock-server.mjs` implements only the endpoints and commands these pages use. `dev/sample-statement.csv` and `dev/sample-statement-camt053.xml` match its sample invoices.
