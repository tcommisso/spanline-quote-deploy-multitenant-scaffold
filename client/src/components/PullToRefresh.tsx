import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  /** Minimum pull distance in px to trigger refresh (default: 80) */
  threshold?: number;
  /** Whether pull-to-refresh is enabled (default: true) */
  enabled?: boolean;
}

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
  enabled = true,
}: PullToRefreshProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const touchStartScrollTop = useRef<number>(0);

  const isActive = enabled && isMobile && !isRefreshing;

  const handleTouchStart = useCallback(
    (e: globalThis.TouchEvent) => {
      if (!isActive) return;
      // Only activate when scrolled to top
      const scrollTop = containerRef.current?.scrollTop ?? window.scrollY;
      if (scrollTop > 5) {
        touchStartY.current = null;
        return;
      }
      touchStartY.current = e.touches[0].clientY;
      touchStartScrollTop.current = scrollTop;
    },
    [isActive]
  );

  const handleTouchMove = useCallback(
    (e: globalThis.TouchEvent) => {
      if (!isActive || touchStartY.current === null) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartY.current;
      // Only pull down, with diminishing returns
      if (diff > 0) {
        const dampened = Math.min(diff * 0.5, 140);
        setPullDistance(dampened);
      } else {
        setPullDistance(0);
      }
    },
    [isActive]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isActive || touchStartY.current === null) {
      setPullDistance(0);
      return;
    }
    touchStartY.current = null;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold * 0.5); // Snap to a loading position
      try {
        await onRefresh();
      } catch {
        // silently fail
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isActive, pullDistance, threshold, onRefresh]);

  useEffect(() => {
    if (!isMobile || !enabled) return;
    const opts: AddEventListenerOptions = { passive: true };
    document.addEventListener("touchstart", handleTouchStart, opts);
    document.addEventListener("touchmove", handleTouchMove, opts);
    document.addEventListener("touchend", handleTouchEnd, opts);
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isMobile, enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  const showIndicator = pullDistance > 10 || isRefreshing;
  const reachedThreshold = pullDistance >= threshold;
  const indicatorOpacity = Math.min(pullDistance / threshold, 1);
  const indicatorScale = 0.5 + indicatorOpacity * 0.5;

  return (
    <div ref={containerRef} className="relative">
      {/* Pull indicator */}
      {showIndicator && (
        <div
          className="flex items-center justify-center overflow-hidden transition-[height] duration-150 ease-out"
          style={{ height: `${pullDistance}px` }}
        >
          <div
            className="flex items-center justify-center rounded-full bg-muted w-9 h-9 shadow-sm transition-transform"
            style={{
              opacity: indicatorOpacity,
              transform: `scale(${indicatorScale})`,
            }}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <ArrowDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  reachedThreshold ? "rotate-180 text-primary" : "text-muted-foreground"
                }`}
              />
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
