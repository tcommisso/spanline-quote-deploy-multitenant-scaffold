import { storageGet } from "../storage";

function storageKeyFromAppUrl(fileUrl?: string | null): string | null {
  if (!fileUrl) return null;
  const marker = "/manus-storage/";

  if (fileUrl.startsWith(marker)) {
    return fileUrl.slice(marker.length).split("?")[0] || null;
  }

  try {
    const parsed = new URL(fileUrl, "https://app.local");
    if (parsed.pathname.startsWith(marker)) {
      return parsed.pathname.slice(marker.length) || null;
    }
  } catch {
    return null;
  }

  return null;
}

export async function resolveStorageUrlForPortal<T extends string | null | undefined>(
  fileUrl: T,
): Promise<T | string | null> {
  const key = storageKeyFromAppUrl(fileUrl ?? null);
  if (!key) return fileUrl ?? null;

  try {
    const { url } = await storageGet(key);
    return url || fileUrl || null;
  } catch (err) {
    console.warn("[StorageSignedUrl] failed to resolve storage URL", err);
    return fileUrl ?? null;
  }
}
