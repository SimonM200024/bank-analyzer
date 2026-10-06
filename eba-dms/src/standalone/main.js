// Entry point of the published, browser-only build.
import { createLocal } from './local.js';

(async () => {
  document.body.insertAdjacentHTML('beforeend', '<div id="boot" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font:13px Segoe UI,Arial,sans-serif;color:#333;background:#f0f0f0">Pripravljam demo podatke …</div>');
  const local = await createLocal({
    onUnavailable: async (what) => {
      const { alertBox } = await import('../../public/js/ui/dialog.js');
      return alertBox(`${what} v tem predogledu ni na voljo, ker brskalnik v predogledu blokira prenose in tiskanje.\nV lokalni različici (npm start) deluje.`, { title: 'Ni na voljo' });
    },
  });
  window.__DMS_LOCAL__ = local;
  document.getElementById('boot')?.remove();
  await import('../../public/js/app.js');
})();
