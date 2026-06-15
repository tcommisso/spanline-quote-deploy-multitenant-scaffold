import { useEffect } from "react";

const FAVICON_ID = "dynamic-favicon";
const FAVICON_KEY = "spanline_favicon_v1";
const APP_ICON_KEY = "spanline_app_icon_v1";

/**
 * Reads the dedicated favicon from localStorage (falls back to app logo/icon)
 * and injects it as the page favicon.
 * Listens for storage events so the favicon updates immediately when
 * changed in Company Settings (even across tabs).
 */
export function useFavicon() {
  useEffect(() => {
    function applyFavicon() {
      let link = document.getElementById(FAVICON_ID) as HTMLLinkElement | null;
      // Priority: dedicated favicon > app logo > default
      const faviconRaw = localStorage.getItem(FAVICON_KEY);
      const appIconRaw = localStorage.getItem(APP_ICON_KEY);
      const raw = faviconRaw || appIconRaw;

      if (raw) {
        try {
          const icon = JSON.parse(raw) as { dataUrl: string };
          if (!link) {
            link = document.createElement("link");
            link.id = FAVICON_ID;
            link.rel = "icon";
            document.head.appendChild(link);
          }
          link.href = icon.dataUrl;
          link.type = "image/png";
        } catch {
          if (link) link.remove();
        }
      } else {
        if (link) link.remove();
      }
    }

    applyFavicon();

    function handleStorage(e: StorageEvent) {
      if (e.key === FAVICON_KEY || e.key === APP_ICON_KEY || e.key === null) {
        applyFavicon();
      }
    }
    window.addEventListener("storage", handleStorage);

    function handleCustom() {
      applyFavicon();
    }
    window.addEventListener("app-icon-changed", handleCustom);
    window.addEventListener("favicon-changed", handleCustom);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("app-icon-changed", handleCustom);
      window.removeEventListener("favicon-changed", handleCustom);
    };
  }, []);
}
