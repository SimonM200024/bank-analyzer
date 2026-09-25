# bank-analyzer

Import bank statements and analyze them quickly. The app now includes a built-in CRM.

Everything lives in a single `index.html`, with Firebase for sign-in and sync. Host it anywhere that serves static files.

## Finance

Overview dashboard, transactions, AI insights, calculators, merchants, subscriptions, PDF reports, NLB PDF statement imports and a stock portfolio.

## CRM

Open it from the **CRM** section in the sidebar.

| Page | What it does |
|---|---|
| CRM Overview | Open pipeline, weighted forecast, won value and win rate for a month, quarter, year or all time. Also shows payments due, today's and overdue tasks, deals closing soon, a won vs. received chart and recent activity. Includes a global search. |
| Pipeline | Deal board with drag and drop between stages, and a sortable table view. Marking a deal Lost asks for a reason. Winning a deal turns a Prospect company into a Customer. |
| Companies | Status filter, search, sortable columns, and money received per company from your bank statements. |
| Contacts | Linked to companies, with clickable email and phone. |
| Tasks | Quick add, priorities, links to companies, contacts and deals, and Overdue, Today, Upcoming, No date and Completed filters. The sidebar badge counts tasks due today or overdue. |

Click any company, contact or deal to open a side panel. It has details, related records, tasks and an activity log where you record notes, calls, emails and meetings.

### Bank integration

- Give a company **bank statement keywords**, for example `LUMA OPTICS`. Every imported transaction whose description contains one of them shows in that company's **🏦 Bank** tab, and its received total appears in the company list.
- A **won** deal can be linked to an incoming bank payment. Suggestions match the company keywords and the amount. You can also record a manual payment such as cash. Split payments are supported, and the deal shows *Awaiting payment*, *Part paid* or *Paid*.
- The 🔔 alerts include overdue tasks, deals past their close date, and won deals still unpaid after 30 days.

### Data

- CRM records are saved per user in Firebase under `data/{uid}/crm`, the node already used for bank data, so the existing security rules cover them. Changes sync live between open devices.
- **⚙️ Settings** (on CRM Overview): rename, reorder, add and remove pipeline stages and set their probabilities. You can also import companies or contacts from CSV, export any list to CSV, download or restore a JSON backup, and load or remove sample data.
- CSV import shows a preview with the result for every row. Rows with a missing name or an invalid email are not imported, and duplicates are skipped. Comma, semicolon and tab separators all work. CSV exports protect against spreadsheet formula injection.

## Tests

`tests/crm.e2e.js` runs the CRM in headless Chromium against an in-memory Firebase mock (52 checks):

```
npm i --no-save playwright && npx playwright install chromium
node tests/crm.e2e.js
```
