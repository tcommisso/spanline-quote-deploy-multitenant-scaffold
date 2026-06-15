/**
 * useAutosave — debounced autosave hook for quote editors.
 *
 * Tracks dirty state, debounces save calls, and exposes status for UI indicators.
 * The hook does NOT fire on initial mount — only after user-initiated changes.
 */
import { useEffect, useRef, useState, useCallback } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

interface UseAutosaveOptions {
  /** Debounce delay in milliseconds (default: 9000) */
  delay?: number;
  /** Whether autosave is enabled (default: true) */
  enabled?: boolean;
}

interface UseAutosaveReturn {
  /** Current autosave status */
  status: AutosaveStatus;
  /** Manually trigger save immediately (bypasses debounce) */
  saveNow: () => void;
  /** Mark the form as dirty (triggers debounced save) */
  markDirty: () => void;
  /** Whether there are unsaved changes */
  isDirty: boolean;
}

/**
 * @param saveFn - Async or sync function that performs the save. Should NOT show its own toast on success (the indicator handles feedback).
 * @param deps - Dependency array whose changes mark the form as dirty (similar to useEffect deps).
 * @param options - Configuration options.
 */
export function useAutosave(
  saveFn: () => void | Promise<void>,
  deps: readonly unknown[],
  options: UseAutosaveOptions = {}
): UseAutosaveReturn {
  const { delay = 9000, enabled = true } = options;

  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [isDirty, setIsDirty] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  const mountedRef = useRef(false);
  const initialLoadRef = useRef(true);
  const depsRef = useRef(deps);

  // Keep saveFn ref up to date
  saveFnRef.current = saveFn;

  // Track whether deps have actually changed from initial load
  useEffect(() => {
    // Skip the very first render (initial data load from server)
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      depsRef.current = deps;
      return;
    }

    // Check if deps actually changed
    const changed = deps.some((dep, i) => dep !== depsRef.current[i]);
    if (changed) {
      depsRef.current = deps;
      if (mountedRef.current && enabled) {
        setIsDirty(true);
        scheduleSave();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Mark mounted after first render cycle completes
  useEffect(() => {
    // Use a short timeout to ensure initial data hydration completes
    const t = setTimeout(() => {
      mountedRef.current = true;
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  const executeSave = useCallback(async () => {
    if (!enabled) return;
    setStatus("saving");
    try {
      await saveFnRef.current();
      setStatus("saved");
      setIsDirty(false);
      // Reset to idle after 2s
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      // Reset to idle after 3s
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [enabled]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      executeSave();
    }, delay);
  }, [delay, executeSave]);

  const saveNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    executeSave();
  }, [executeSave]);

  const markDirty = useCallback(() => {
    if (!enabled) return;
    setIsDirty(true);
    scheduleSave();
  }, [enabled, scheduleSave]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { status, saveNow, markDirty, isDirty };
}
