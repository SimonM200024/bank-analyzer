# Adrial Apps · Invoices

A filing system for PDF invoices, built to drop into the Adrial Apps hub
(`https://adrial-apps-oxgsupvfuq-ew.a.run.app/`).

- **Add** PDF invoices: drag them onto the page or pick them, as many as you like. Exact duplicates are skipped.
- **Read** automatically: vendor, vendor VAT ID, invoice number, invoice and due dates, currency,
  total, VAT and net. Tuned for Slovenian invoices (*Za plačilo, DDV, Rok plačila, Kupec…*) and
  English ones; scanned PDFs can be read with OCR (Slovenian + English).
- **Check** each new invoice once, next to its PDF. Fields the reader was unsure of are marked
  *Check*. Corrections to the vendor name and category are remembered for that sender (by VAT ID).
- **See your costs**: spent per year or month, monthly average, VAT, unpaid and overdue; costs by
  month, by category and by vendor (click any bar to filter); full-text search inside the PDFs.
- **Export**: spreadsheet (.csv, `;`-separated with decimal commas for Slovenian Excel), a .zip of
  PDFs renamed `date_vendor_number.pdf` plus the spreadsheet for your accountant, and a full backup
  .zip you can restore in any browser.

## Where the invoices are stored

In **your browser** (IndexedDB), on the device you use. Nothing is uploaded to the hub or anywhere
else. The hub URL is public, so this is deliberate: anyone who opens the link sees an empty app,
never your invoices. The app asks the browser to keep the data even when disk space runs low.

Because of that:

- Invoices added on your laptop are not on your phone. Move them with **Export → Full backup** and
  **Restore a backup…**.
- Clearing site data for the hub, or using a private window, removes or hides them. Make a full
  backup now and then.

## Add it to the hub

The hub's source is on your PC in `C:\hub` (the folder with `deploy.ps1`).

1. Copy the `invoices` folder from here to `C:\hub\invoices` (so you have `C:\hub\invoices\index.html`).
2. Open `C:\hub\index.html` and paste the card from `hub-card.html` inside `<main class="grid">`.
3. In PowerShell in `C:\hub`: `powershell -ExecutionPolicy Bypass -File .\deploy.ps1`
4. Open `https://adrial-apps-oxgsupvfuq-ew.a.run.app/invoices/`.

The app has no build step and no server code: `index.html`, `app.js` and `parser.js`. It loads
pdf.js from cdnjs; JSZip (exports) and Tesseract (OCR) load from cdnjs/jsDelivr only when used.
It uses the hub's `/_shared/adrial-shell.js` for the back button and the Light/Dark/Auto switch.

## First-time setup in the app

Open **Settings** (the sliders button):

- **Your company names**: preset to `Adrial`. Lines with these names are never taken as the vendor.
- **Your VAT IDs**: add yours so they are never read as the vendor's VAT ID.
- **Categories**: edit the list to match how you book costs.

## Tests

```
node --test adrial-apps/invoices-tests/parser.test.js           # parser, no browser
python3 adrial-apps/invoices-tests/make-samples.py <dir> --year  # ~60 fictional invoices
```

`invoices-tests/e2e.mjs` (whole app in headless Chromium: import, review, dashboard, CSV, backup →
restore, duplicates, phone layout) and `invoices-tests/ocr-e2e.mjs` (OCR on the scanned sample)
serve the CDN libraries from local npm packages; the run instructions are at the top of each file.
`invoices-tests/samples/` holds six fictional sample invoices you can drop into the app to try it.
