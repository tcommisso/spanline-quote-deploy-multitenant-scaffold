import { useRef, useCallback, useEffect } from "react";

interface UseSwipeTabsOptions {
  /** Ordered list of tab values */
  tabs: string[];
  /** Current active tab value */
  activeTab: string;
  /** Callback to change the active tab */
  onTabChange: (tab: string) => void;
  /** Minimum swipe distance in px to trigger tab change (default: 50) */
  threshold?: number;
  /** Whether swipe is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Hook that adds swipe left/right gesture support for tab navigation on touch devices.
 * Returns a ref to attach to the swipeable container element.
 */
export function useSwipeTabs({
  tabs,
  activeTab,
  onTabChange,
  threshold = 50,
  enabled = true,
}: UseSwipeTabsOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwiping = useRef(false);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isSwiping.current = false;
    },
    [enabled]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;
      const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);

      // Only consider horizontal swipes (more X movement than Y)
      if (deltaX > deltaY && deltaX > 10) {
        isSwiping.current = true;
      }
    },
    [enabled]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!enabled || !isSwiping.current) return;

      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const currentIndex = tabs.indexOf(activeTab);

      if (Math.abs(deltaX) < threshold) return;

      if (deltaX < -threshold && currentIndex < tabs.length - 1) {
        // Swipe left → next tab
        onTabChange(tabs[currentIndex + 1]);
      } else if (deltaX > threshold && currentIndex > 0) {
        // Swipe right → previous tab
        onTabChange(tabs[currentIndex - 1]);
      }

      isSwiping.current = false;
    },
    [enabled, tabs, activeTab, onTabChange, threshold]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, enabled]);

  return containerRef;
}
