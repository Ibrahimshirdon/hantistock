import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// A new deploy replaces the old build's hashed JS chunk filenames outright,
// so a tab left open across a deploy can end up asking the CDN for a chunk
// that no longer exists — Vercel's SPA rewrite then serves index.html for
// that request instead of a 404, and the browser rejects it as an invalid
// module (the "Failed to fetch dynamically imported module" crash). The
// service worker's own update check only runs on navigation by default, so
// an idle tab could sit on a stale build indefinitely; polling here closes
// that gap, and reloading as soon as a new version is found means nobody
// has to notice or hard-refresh manually.
const UPDATE_CHECK_INTERVAL_MS = 60_000;

export function PwaUpdater() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Without this, a browser that already has an old service worker
      // installed (e.g. from earlier the same day) serves that stale
      // precached app shell on every fresh load — including a full
      // close-and-reopen of the browser — until the first 60s poll below
      // happens to fire, so whatever bug a same-day deploy just fixed
      // keeps appearing to still be broken. Checking immediately on
      // registration means a stale shell is caught (and reloaded via
      // needRefresh below) on the very next load, not up to a minute later.
      registration.update();
      setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS);

      // Background tabs get their timers throttled by the browser (often to
      // once a minute or slower), so a tab left open — even one someone
      // just switches back to after working in another tab for a while —
      // can't rely on the interval above alone. Checking again the moment
      // the tab actually becomes visible catches that case without waiting
      // on a throttled timer.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update();
      });
    },
  });

  useEffect(() => {
    if (needRefresh) {
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  return null;
}
