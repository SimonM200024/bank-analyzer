# Postbench

Make social media posts and banners in the browser. No build step, no account, no API keys.

Open `index.html` in a browser (needs internet once for the Google Fonts).

- Sizes: Instagram post and portrait, Story/Reel/TikTok, Facebook post and cover, X, LinkedIn banner, YouTube thumbnail, Pinterest pin.
- Eight layouts that re-flow to each size, so one design exports to every platform.
- Your photo, logo, colors and fonts. "Save as my brand" keeps them in this browser.
- Draggable text, emoji and image stickers.
- Export PNG or JPG, or a ZIP with every size.
- Describe your ad: type what you want to promote and Claude returns three designs plus a ready-to-post caption. This section only appears where the page can ask Claude (the claude.ai viewer, using the viewer's own Claude account). A public website would need a small server that calls the Claude API with a key kept on the server.

Everything is drawn on a canvas (`draw()` in `index.html`), and the same code makes the preview and the exported files.
