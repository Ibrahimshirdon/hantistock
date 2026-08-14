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
      setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  return null;
}
