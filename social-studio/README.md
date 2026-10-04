# Postbench

Make social media posts, web ads and flyers in the browser. No build step, no account, no API keys.

Open `index.html` in a browser (it needs internet for Google Fonts and the QR code library).

## Create
- Sizes: Instagram post and portrait, Story/Reel/TikTok, Facebook post and cover, X, LinkedIn banner, YouTube thumbnail, Pinterest pin, four Google display ad sizes, and A4/A5 flyers at 300 dpi.
- Eight layouts that re-flow to each size, so one design exports to every platform.
- Your photo, logo, colors and fonts; draggable text, emoji, image and QR code stickers.
- Turn a customer review into a quote post. The quote always uses the customer's own words.
- Caption and image description (alt text) fields with copy buttons.
- Export PNG, JPG, a ZIP of every size, a print PDF for flyers, and a short animated video (MP4 where the browser can encode H.264, otherwise WebM).

## Month plan
- Add designs to a dated plan, open any post to edit it, and save the whole plan as a ZIP of images plus `posting-calendar.csv` (dates, captions, alt text).

## Business
- Name, what you sell, area, customers, tone, language, link and handle, plus a saved brand look. Kept in this browser.

## Claude features
Describe your ad (three designs and a caption), Plan a month of posts, picking the best line from a review, caption rewrites, translation and alt text. These only appear where the page can ask Claude: the claude.ai viewer, using the viewer's own Claude account. A public website would need a small server that calls the Claude API with a key kept on the server.

Claude's replies are treated as untrusted: only known layout, theme and size ids, 6-digit hex colors and trimmed text are accepted, text/accent contrast is corrected, and a review excerpt is used only if it appears word for word in the review. The prompts tell Claude to use only facts from the request, the business details and the owner's notes.

Everything is drawn on a canvas by `draw()` in `index.html`; the same code makes the preview, the exports and the video frames.
