import { useEffect } from "react";

type InstallSurface = {
  key: "main" | "trade-portal";
  title: string;
  manifest: string;
  icon: string;
};

const MAIN_SURFACE: InstallSurface = {
  key: "main",
  title: "Altaspan",
  manifest: "/manifest.json",
  icon: "/icons/icon-192.png",
};

const TRADE_PORTAL_SURFACE: InstallSurface = {
  key: "trade-portal",
  title: "Trade Portal",
  manifest: "/trade-portal-manifest.json",
  icon: "/icons/trade-portal-icon-192.png",
};

function installSurfaceForPath(pathname: string): InstallSurface {
  return pathname.startsWith("/trade-portal") ? TRADE_PORTAL_SURFACE : MAIN_SURFACE;
}

function ensureMeta(id: string, name: string) {
  let meta = document.getElementById(id) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.id = id;
    meta.name = name;
    document.head.appendChild(meta);
  }
  return meta;
}

function ensureLink(id: string, rel: string) {
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = rel;
    document.head.appendChild(link);
  }
  return link;
}

export function applyInstallSurfaceMetadata(pathname?: string) {
  if (typeof document === "undefined") return;

  const surface = installSurfaceForPath(pathname ?? window.location.pathname);
  document.documentElement.dataset.installSurface = surface.key;

  const appleTitle = ensureMeta("install-apple-title", "apple-mobile-web-app-title");
  appleTitle.content = surface.title;

  const manifest = ensureLink("install-manifest", "manifest");
  manifest.href = surface.manifest;

  const icon = ensureLink("install-icon", "icon");
  icon.type = "image/png";
  icon.sizes = "192x192";
  icon.href = surface.icon;

  const appleIcon = ensureLink("install-apple-icon", "apple-touch-icon");
  appleIcon.sizes = "192x192";
  appleIcon.href = surface.icon;

  (window as typeof window & { __SPANLINE_INSTALL_SURFACE__?: InstallSurface }).__SPANLINE_INSTALL_SURFACE__ = surface;
}

export function useInstallSurfaceMetadata(pathname: string) {
  useEffect(() => {
    applyInstallSurfaceMetadata(pathname);
  }, [pathname]);
}
