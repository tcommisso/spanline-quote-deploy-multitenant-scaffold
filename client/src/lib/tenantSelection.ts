const TENANT_ID_STORAGE_KEY = "altaspan:selected-tenant-id";

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isPortalRoute() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/portal") || window.location.pathname.startsWith("/trade-portal");
}

export function getSelectedTenantId() {
  if (!canUseBrowserStorage()) return null;

  const raw = window.localStorage.getItem(TENANT_ID_STORAGE_KEY);
  const tenantId = Number(raw);
  return Number.isInteger(tenantId) && tenantId > 0 ? tenantId : null;
}

export function getSelectedTenantHeader() {
  if (isPortalRoute()) return undefined;
  const tenantId = getSelectedTenantId();
  return tenantId ? String(tenantId) : undefined;
}

export function setSelectedTenantId(tenantId: number | null) {
  if (!canUseBrowserStorage()) return;

  if (tenantId && Number.isInteger(tenantId) && tenantId > 0) {
    window.localStorage.setItem(TENANT_ID_STORAGE_KEY, String(tenantId));
  } else {
    window.localStorage.removeItem(TENANT_ID_STORAGE_KEY);
  }
}
